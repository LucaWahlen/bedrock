"use server"

import { and, eq } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import {
  memberHasRole,
  splitRoles,
  type OrganizationRole,
} from "@/features/auth"
import {
  deliverAfterResponse,
  sendMemberRoleChangedNotice,
} from "@/features/notifications"
import { authorizeMemberMutation } from "@/features/organizations/lib/member-mutation"
import {
  MEMBER_ROLES,
  ROOT_MEMBER_ROLES,
  type MemberRole,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { member, user } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

const ROLES: readonly OrganizationRole[] = MEMBER_ROLES

const ROOT_ROLES: readonly string[] = ROOT_MEMBER_ROLES

export async function setMemberRole(
  organizationId: string,
  userId: string,
  role: MemberRole
): Promise<ActionResult> {
  if (!ROLES.includes(role)) {
    return { success: false, error: "That role does not exist" }
  }

  const authorization = await authorizeMemberMutation({
    action: "organization.member_role_changed",
    organizationId,
    userIds: [userId],
    deniedError: "You cannot change roles in this organization",
    selfPolicy: "administrators",
  })
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { actor, actorUser, organization, canManageOwners } =
    authorization.context
  const auditedOrganization = {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  }

  // Filled in once the change is made, for the notice sent after commit.
  const changed: {
    target?: { name: string; email: string; from: string[] }
  } = {}
  const failure = await db.transaction(async (tx) => {
    // Locking the owners serializes this against any other change to them, so
    // two concurrent demotions cannot both see a second owner and leave none.
    const owners = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organization.id),
          memberHasRole(member.role, "owner")
        )
      )
      .for("update")

    const [target] = await tx
      .select({
        id: member.id,
        role: member.role,
        name: user.name,
        email: user.email,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, organization.id),
          eq(member.userId, userId)
        )
      )
      .limit(1)

    if (!target) return "That person is not a member of this organization"

    if (organization.isRoot && !ROOT_ROLES.includes(role)) {
      return "The root organization has no plain members"
    }

    const currentRoles = splitRoles(target.role)
    const isOwner = currentRoles.includes("owner")

    if (currentRoles.length === 1 && currentRoles[0] === role) {
      return "That member already has this role"
    }

    if ((isOwner || role === "owner") && !canManageOwners) {
      return "Only an owner can grant or revoke ownership"
    }

    if (isOwner && role !== "owner" && owners.length <= 1) {
      return organization.isRoot
        ? "The last root owner cannot be demoted"
        : "The last owner cannot be demoted"
    }

    const [updated] = await tx
      .update(member)
      .set({ role })
      // Guards against a concurrent change to the very row being replaced.
      .where(and(eq(member.id, target.id), eq(member.role, target.role)))
      .returning({ id: member.id })

    if (!updated) return "That membership changed while it was being updated"

    await recordAuditEvent(
      {
        action: "organization.member_role_changed",
        actor,
        organization: auditedOrganization,
        target: { type: "user", id: userId, label: target.name },
        metadata: { from: currentRoles, to: role },
      },
      tx
    )
    changed.target = {
      name: target.name,
      email: target.email,
      from: currentRoles,
    }

    return null
  })

  if (failure) {
    await recordAuditEvent({
      action: "organization.member_role_changed",
      outcome: "failure",
      actor,
      organization: auditedOrganization,
      target: { type: "user", id: userId },
      reason: failure,
    })

    return { success: false, error: failure }
  }

  // Stepping down yourself needs no mail to tell you.
  const notice = changed.target
  if (notice && userId !== actorUser.id) {
    deliverAfterResponse(() =>
      sendMemberRoleChangedNotice({
        recipient: notice,
        organization,
        actorName: actorUser.name,
        from: notice.from,
        to: role,
      })
    )
  }

  revalidateEverywhere()

  return { success: true }
}
