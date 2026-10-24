"use server"

import { and, eq } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import {
  INVITATION_TTL_SECONDS,
  createInvitationToken,
} from "@/features/organizations/lib/invitations"
import { authorizeMemberMutation } from "@/features/organizations/lib/member-mutation"
import { isOrganizationRole } from "@/features/organizations/lib/member-role-display"
import { sendInvitationEmail } from "@/features/organizations/lib/send-invitation-email"
import type { InviteMemberResult } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { invitation } from "@/features/shared/lib/db/schema"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

const RESEND_LIMIT = { window: 60 * 60, max: 5 }

export async function resendInvitation(
  organizationId: string,
  invitationId: string
): Promise<InviteMemberResult> {
  const authorization = await authorizeMemberMutation({
    action: "organization.invitation_resent",
    organizationId,
    userIds: [],
    deniedError: "You cannot manage invitations for this organization",
  })
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { actor, actorUser, organization } = authorization.context
  const auditedOrganization = {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  }

  async function fail(error: string): Promise<InviteMemberResult> {
    await recordAuditEvent({
      action: "organization.invitation_resent",
      outcome: "failure",
      actor,
      organization: auditedOrganization,
      target: { type: "invitation", id: invitationId },
      reason: error,
    })

    return { success: false, error }
  }

  if (organization.status !== "active") {
    return fail("This organization cannot invite anyone right now")
  }

  const throttle = await consumeRateLimit(
    `invitation:resend:${invitationId}`,
    RESEND_LIMIT
  )
  if (!throttle.allowed) {
    return fail(
      "That invitation has been sent too many times. Try again later."
    )
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_SECONDS * 1000)
  // A fresh token retires the previous link, so a forwarded mail stops working
  // the moment the invitation is sent again.
  const { token, tokenHash } = createInvitationToken()

  const resent = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(invitation)
      .set({ tokenHash, expiresAt, lastSentAt: now })
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.organizationId, organization.id)
        )
      )
      .returning({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
      })

    if (!updated) return null

    await recordAuditEvent(
      {
        action: "organization.invitation_resent",
        actor,
        organization: auditedOrganization,
        target: {
          type: "invitation",
          id: updated.id,
          label: updated.email,
        },
      },
      tx
    )

    return updated
  })

  if (!resent) return fail("That invitation is no longer open")

  const role =
    resent.role && isOrganizationRole(resent.role) ? resent.role : "member"

  const delivered = await sendInvitationEmail({
    organization: {
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      color: organization.color,
    },
    email: resent.email,
    role,
    inviterName: actorUser.name,
    token,
    expiresAt,
  })

  revalidateEverywhere()

  return { success: true, delivered }
}
