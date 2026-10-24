"use server"

import { headers } from "next/headers"

import { getAccessContext } from "@/features/auth"
import { resolveInvitationByToken } from "@/features/organizations/lib/resolve-invitation"
import type {
  InvitationLookup,
  InvitationViewer,
} from "@/features/organizations/types"
import { clientAddress } from "@/features/shared/lib/client-address"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"

// The token is the only credential here, so guessing is throttled by source.
const LOOKUP_LIMIT = { window: 15 * 60, max: 40 }

export async function getInvitation(token: string): Promise<InvitationLookup> {
  const source = clientAddress(await headers())
  const throttle = await consumeRateLimit(
    `invitation:lookup:${source ?? "unknown"}`,
    LOOKUP_LIMIT
  )
  if (!throttle.allowed) return { success: false, refusal: "unknown" }

  const resolution = await resolveInvitationByToken(token)
  if (!resolution.ok) return { success: false, refusal: resolution.refusal }

  const { invitation } = resolution
  const access = await getAccessContext()
  const isRecipient = access.user?.email.toLowerCase() === invitation.email
  const viewer: InvitationViewer = !access.user
    ? "anonymous"
    : isRecipient
      ? "recipient"
      : "other"

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
      hasAccount: invitation.recipientUserId !== null,
      viewer,
      signedInAs: viewer === "other" ? (access.user?.email ?? null) : null,
    },
  }
}
