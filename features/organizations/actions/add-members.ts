"use server"

import { inArray } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import type { OrganizationRole } from "@/features/auth"
import {
  deliverAfterResponse,
  sendMemberAddedNotice,
} from "@/features/notifications"
import { authorizeMemberMutation } from "@/features/organizations/lib/member-mutation"
import { settleInvitationsFor } from "@/features/organizations/lib/settle-invitations"
import {
  MEMBER_ROLES,
  ROOT_MEMBER_ROLES,
  type AddMembersResult,
  type MemberRole,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { member, user } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

const ROLES: readonly OrganizationRole[] = MEMBER_ROLES

const ROOT_ROLES: readonly string[] = ROOT_MEMBER_ROLES

const MAX_MEMBERS_PER_REQUEST = 50

export async function addMembers(
  organizationId: string,
  userIds: string[],
  role: MemberRole
): Promise<AddMembersResult> {
  if (!ROLES.includes(role)) {
    return { success: false, error: "That role does not exist" }
  }

  const subjects = Array.from(new Set(userIds))
  if (subjects.length === 0) {
    return { success: false, error: "Choose at least one account" }
  }
  if (subjects.length > MAX_MEMBERS_PER_REQUEST) {
    return {
      success: false,
      error: `Add at most ${MAX_MEMBERS_PER_REQUEST} people at a time`,
    }
  }

  const authorization = await authorizeMemberMutation({
    action: "organization.member_added",
    organizationId,
    userIds: subjects,
    deniedError: "You cannot add members to this organization",
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

  // Who was actually added, for the notices sent once this has committed.
  const addedAccounts: { name: string; email: string }[] = []
  const outcome = await db.transaction<{ failure: string } | { added: number }>(
    async (tx) => {
      // An organization nobody may enter is not one to hand access to.
      if (organization.status !== "active") {
        return {
          failure:
            organization.status === "suspended"
              ? "A suspended organization cannot take new members"
              : "A deleted organization cannot take new members",
        }
      }

      if (organization.isRoot && !ROOT_ROLES.includes(role)) {
        return { failure: "The root organization has no plain members" }
      }

      if (role === "owner" && !canManageOwners) {
        return { failure: "Only an owner can grant ownership" }
      }

      const accounts = await tx
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.id, subjects))

      if (accounts.length !== subjects.length) {
        return { failure: "One of those accounts does not exist" }
      }

      const createdAt = new Date()
      const added = await tx
        .insert(member)
        .values(
          accounts.map((account) => ({
            id: crypto.randomUUID(),
            organizationId: organization.id,
            userId: account.id,
            role,
            createdAt,
          }))
        )
        .onConflictDoNothing({
          target: [member.organizationId, member.userId],
        })
        .returning({ userId: member.userId })

      if (added.length === 0) {
        return {
          failure:
            accounts.length === 1
              ? "That person is already a member of this organization"
              : "They are already members of this organization",
        }
      }

      const addedIds = new Set(added.map((row) => row.userId))

      await settleInvitationsFor(
        tx,
        organization.id,
        accounts
          .filter((account) => addedIds.has(account.id))
          .map((account) => account.email)
      )

      for (const account of accounts) {
        if (!addedIds.has(account.id)) continue

        await recordAuditEvent(
          {
            action: "organization.member_added",
            actor,
            organization: auditedOrganization,
            target: { type: "user", id: account.id, label: account.name },
            metadata: { role },
          },
          tx
        )
        addedAccounts.push(account)
      }

      return { added: added.length }
    }
  )

  if ("failure" in outcome) {
    await recordAuditEvent({
      action: "organization.member_added",
      outcome: "failure",
      actor,
      organization: auditedOrganization,
      target:
        subjects.length === 1 ? { type: "user", id: subjects[0] } : undefined,
      reason: outcome.failure,
    })

    return { success: false, error: outcome.failure }
  }

  // Adding yourself is refused above, so everyone here was added by someone else.
  for (const recipient of addedAccounts) {
    deliverAfterResponse(() =>
      sendMemberAddedNotice({
        recipient,
        organization,
        actorName: actorUser.name,
        role,
      })
    )
  }

  revalidateEverywhere()

  // Anyone already a member is skipped, so the caller cannot assume everyone it
  // named was added.
  return {
    success: true,
    added: outcome.added,
    skipped: subjects.length - outcome.added,
  }
}
