"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { getAccessContext } from "@/features/auth"
import { claimInvitation } from "@/features/organizations/lib/claim-invitation"
import { invitationRefusalMessage } from "@/features/organizations/lib/invitation-display"
import { resolvePendingInvitationFor } from "@/features/organizations/lib/resolve-invitation"
import type { AcceptInvitationResult } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

/**
 * Accepting without the mailed token, on the strength of the session alone.
 *
 * This is what stops the login page being a dead end for an invited person: the
 * server stores only the token's digest, so it cannot rebuild the link for
 * somebody who arrived by signing in rather than by following the mail.
 *
 * A session is the stronger proof of the two. The token is a bearer credential
 * that can be forwarded or left sitting in a shared inbox, while the session
 * required the password. What the token additionally proves is control of the
 * mailbox, and that is exactly what a confirmed address already establishes, so
 * an unconfirmed one is refused here and must follow the link instead.
 */
export async function acceptPendingInvitation(
  organizationSlug: string
): Promise<AcceptInvitationResult> {
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) {
    return { success: false, error: "Sign in to accept this invitation" }
  }

  // Otherwise anyone could sign up as an address they do not own and take an
  // invitation meant for whoever actually holds it.
  if (!currentUser.emailVerified) {
    return {
      success: false,
      error: "Confirm your email address before accepting an invitation",
    }
  }

  const [target] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, organizationSlug))
    .limit(1)

  if (!target) {
    return { success: false, error: "That organization does not exist" }
  }

  const resolution = await resolvePendingInvitationFor(
    currentUser.email,
    target.id
  )
  if (!resolution.ok) {
    await recordAuditEvent({
      action: "organization.invitation_accepted",
      outcome: "denied",
      actor: auditActorFromUser(currentUser),
      organization: { id: target.id },
      reason: `No usable invitation: ${resolution.refusal}`,
    })

    return {
      success: false,
      error: invitationRefusalMessage(
        await getTranslations("organizations"),
        resolution.refusal
      ),
    }
  }

  const claimed = await claimInvitation({
    invited: resolution.invitation,
    claimant: currentUser,
    via: "session",
  })

  if (!claimed) {
    return { success: false, error: "That invitation is no longer pending" }
  }

  revalidateEverywhere()

  return { success: true, slug: resolution.invitation.organization.slug }
}
