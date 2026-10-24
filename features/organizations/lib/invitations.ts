import { createHash, randomBytes } from "node:crypto"

import { absoluteUrl } from "@/features/shared/lib/app-url"

export const INVITATION_TTL_SECONDS = 60 * 60 * 24 * 7

// Long enough that guessing is hopeless, and URL-safe so a mail client cannot
// mangle it when it linkifies the address.
export function createInvitationToken() {
  const token = randomBytes(32).toString("base64url")

  return { token, tokenHash: hashInvitationToken(token) }
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function invitationLink(slug: string, token: string) {
  return absoluteUrl(
    `/org/${slug}/invitation?token=${encodeURIComponent(token)}`
  )
}
