"use server"

import { eq } from "drizzle-orm"

import { getAccessContext } from "@/features/auth"
import { resolvePendingInvitationFor } from "@/features/organizations/lib/resolve-invitation"
import type { InvitationLookup } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"

/**
 * What is waiting for the signed-in visitor in this organization. Needs no
 * token, and discloses nothing a token would: it only ever reads what was
 * offered to the address on the caller's own session.
 */
export async function getPendingInvitation(
  organizationSlug: string
): Promise<InvitationLookup> {
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) return { success: false, refusal: "unknown" }

  // Without the token the session is the only proof, and it is only proof of
  // the address once that address has been confirmed.
  if (!currentUser.emailVerified) {
    return { success: false, refusal: "unconfirmed_address" }
  }

  const [target] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, organizationSlug))
    .limit(1)

  if (!target) return { success: false, refusal: "unknown" }

  const resolution = await resolvePendingInvitationFor(
    currentUser.email,
    target.id
  )
  if (!resolution.ok) return { success: false, refusal: resolution.refusal }

  const { invitation } = resolution

  return {
    success: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organization.name,
      organizationSlug: invitation.organization.slug,
      organizationLogo: invitation.organization.logo,
      inviterName: invitation.inviterName,
      expiresAt: invitation.expiresAt.toISOString(),
      hasAccount: true,
      viewer: "recipient",
      signedInAs: null,
    },
  }
}
