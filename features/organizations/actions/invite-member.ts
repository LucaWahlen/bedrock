"use server"

import { and, eq, lte, sql } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import type { OrganizationRole } from "@/features/auth"
import {
  isValidEmail,
  normalizeEmail,
} from "@/features/organizations/lib/email-normalization"
import {
  INVITATION_TTL_SECONDS,
  createInvitationToken,
} from "@/features/organizations/lib/invitations"
import { authorizeMemberMutation } from "@/features/organizations/lib/member-mutation"
import { sendInvitationEmail } from "@/features/organizations/lib/send-invitation-email"
import {
  MEMBER_ROLES,
  ROOT_MEMBER_ROLES,
  type InviteMemberInput,
  type InviteMemberResult,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { invitation, member, user } from "@/features/shared/lib/db/schema"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

const ROLES: readonly OrganizationRole[] = MEMBER_ROLES

const ROOT_ROLES: readonly string[] = ROOT_MEMBER_ROLES

// Sending mail to an address of someone else's choosing, so the ceiling is per
// organization rather than per caller.
const INVITE_LIMIT = { window: 60 * 60, max: 60 }

export async function inviteMember({
  organizationId,
  email,
  role,
}: InviteMemberInput): Promise<InviteMemberResult> {
  const recipient = normalizeEmail(email)

  if (!isValidEmail(recipient) || recipient.length > 254) {
    return { success: false, error: "Enter a valid email address" }
  }
  if (!ROLES.includes(role)) {
    return { success: false, error: "That role does not exist" }
  }

  const authorization = await authorizeMemberMutation({
    action: "organization.member_invited",
    organizationId,
    userIds: [],
    deniedError: "You cannot invite people to this organization",
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

  const throttle = await consumeRateLimit(
    `invitation:organization:${organization.id}`,
    INVITE_LIMIT
  )
  if (!throttle.allowed) {
    return {
      success: false,
      error: "Too many invitations have been sent. Try again later.",
    }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_SECONDS * 1000)
  const { token, tokenHash } = createInvitationToken()

  const outcome = await db.transaction<
    { failure: string } | { invitationId: string }
  >(async (tx) => {
    if (organization.status !== "active") {
      return {
        failure:
          organization.status === "suspended"
            ? "A suspended organization cannot invite anyone"
            : "A deleted organization cannot invite anyone",
      }
    }

    if (organization.isRoot && !ROOT_ROLES.includes(role)) {
      return { failure: "The root organization has no plain members" }
    }

    if (role === "owner" && !canManageOwners) {
      return { failure: "Only an owner can grant ownership" }
    }

    const [existingMember] = await tx
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, organization.id),
          eq(sql`lower(${user.email})`, recipient)
        )
      )
      .limit(1)

    if (existingMember) {
      return { failure: "That person is already a member of this organization" }
    }

    // A lapsed invitation is hidden from the list but still holds this
    // address's slot in the unique index, so clear it here instead of refusing
    // on behalf of something the caller cannot see.
    await tx
      .delete(invitation)
      .where(
        and(
          eq(invitation.organizationId, organization.id),
          eq(sql`lower(${invitation.email})`, recipient),
          lte(invitation.expiresAt, now)
        )
      )

    // The unique index on the recipient is what actually decides this, so two
    // simultaneous invitations cannot both mint a live token.
    const [created] = await tx
      .insert(invitation)
      .values({
        id: crypto.randomUUID(),
        organizationId: organization.id,
        email: recipient,
        role,
        expiresAt,
        createdAt: now,
        lastSentAt: now,
        inviterId: actorUser.id,
        tokenHash,
      })
      .onConflictDoNothing()
      .returning({ id: invitation.id })

    if (!created) {
      return { failure: "That address already has an open invitation" }
    }

    await recordAuditEvent(
      {
        action: "organization.member_invited",
        actor,
        organization: auditedOrganization,
        target: { type: "invitation", id: created.id, label: recipient },
        metadata: { role },
      },
      tx
    )

    return { invitationId: created.id }
  })

  if ("failure" in outcome) {
    await recordAuditEvent({
      action: "organization.member_invited",
      outcome: "failure",
      actor,
      organization: auditedOrganization,
      reason: outcome.failure,
    })

    return { success: false, error: outcome.failure }
  }

  // Sent after the row is committed: a mail promising access that was never
  // recorded is worse than an invitation whose delivery has to be retried.
  const delivered = await sendInvitationEmail({
    organization: {
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      color: organization.color,
    },
    email: recipient,
    role,
    inviterName: actorUser.name,
    token,
    expiresAt,
  })

  revalidateEverywhere()

  return { success: true, delivered }
}
