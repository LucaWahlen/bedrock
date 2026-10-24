"use server"

import { and, eq } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { memberHasRole, splitRoles } from "@/features/auth"
import {
  deliverAfterResponse,
  sendMemberRemovedNotice,
} from "@/features/notifications"
import { authorizeMemberMutation } from "@/features/organizations/lib/member-mutation"
import { db } from "@/features/shared/lib/db/client"
import { member, user } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

export async function removeMember(
  organizationId: string,
  userId: string
): Promise<ActionResult> {
  const authorization = await authorizeMemberMutation({
    action: "organization.member_removed",
    organizationId,
    userIds: [userId],
    deniedError: "You cannot remove members from this organization",
    selfPolicy: "anyone",
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

  // Filled in once the membership is gone, for the notice sent after commit.
  const removal: { target?: { name: string; email: string } } = {}
  const failure = await db.transaction(async (tx) => {
    // Locking the owners serializes this against any other change to them, so
    // two concurrent removals cannot both see a second owner and leave none.
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

    const currentRoles = splitRoles(target.role)
    const isOwner = currentRoles.includes("owner")

    if (isOwner && !canManageOwners) {
      return "Only an owner can remove another owner"
    }

    if (isOwner && owners.length <= 1) {
      return organization.isRoot
        ? "The last root owner cannot be removed"
        : "The last owner cannot be removed"
    }

    const [removed] = await tx
      .delete(member)
      .where(and(eq(member.id, target.id), eq(member.role, target.role)))
      .returning({ id: member.id })

    if (!removed) return "That membership changed while it was being removed"

    await recordAuditEvent(
      {
        action: "organization.member_removed",
        actor,
        organization: auditedOrganization,
        target: { type: "user", id: userId, label: target.name },
        metadata: { roles: currentRoles },
      },
      tx
    )
    removal.target = { name: target.name, email: target.email }

    return null
  })

  if (failure) {
    await recordAuditEvent({
      action: "organization.member_removed",
      outcome: "failure",
      actor,
      organization: auditedOrganization,
      target: { type: "user", id: userId },
      reason: failure,
    })

    return { success: false, error: failure }
  }

  // Leaving is your own doing, so only someone removed by another hears of it.
  const recipient = removal.target
  if (recipient && userId !== actorUser.id) {
    deliverAfterResponse(() =>
      sendMemberRemovedNotice({
        recipient,
        organization,
        actorName: actorUser.name,
      })
    )
  }

  revalidateEverywhere()

  return { success: true }
}
