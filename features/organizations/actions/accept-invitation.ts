"use server"

import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { getAccessContext } from "@/features/auth"
import { claimInvitation } from "@/features/organizations/lib/claim-invitation"
import { invitationRefusalMessage } from "@/features/organizations/lib/invitation-display"
import { resolveInvitationByToken } from "@/features/organizations/lib/resolve-invitation"
import type { AcceptInvitationResult } from "@/features/organizations/types"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

export async function acceptInvitation(
  token: string
): Promise<AcceptInvitationResult> {
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) {
    return { success: false, error: "Sign in to accept this invitation" }
  }

  const resolution = await resolveInvitationByToken(token)
  if (!resolution.ok) {
    return {
      success: false,
      error: invitationRefusalMessage(
        await getTranslations("organizations"),
        resolution.refusal
      ),
    }
  }

  const invited = resolution.invitation

  // The token was mailed to one address. Holding it does not entitle a
  // different account to the seat it was written for.
  if (currentUser.email.toLowerCase() !== invited.email) {
    await recordAuditEvent({
      action: "organization.invitation_accepted",
      outcome: "denied",
      actor: auditActorFromUser(currentUser),
      target: { type: "invitation", id: invited.id, label: invited.email },
      reason: "Invitation belongs to another address",
    })

    return {
      success: false,
      error: `This invitation was sent to ${invited.email}`,
    }
  }

  const claimed = await claimInvitation({
    invited,
    claimant: currentUser,
    via: "session",
  })

  if (!claimed) {
    return { success: false, error: "That invitation is no longer pending" }
  }

  revalidateEverywhere()

  return { success: true, slug: invited.organization.slug }
}
