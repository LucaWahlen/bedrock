import { absoluteUrl } from "@/features/shared/lib/app-url"
import { env } from "@/features/shared/lib/config/env"

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Base64url, as `createInvitationToken` mints them. Checked wherever one is read
// back out of a URL, so nothing else can be echoed into a link or a mail.
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,200}$/

export function isInvitationToken(
  value: string | null | undefined
): value is string {
  return value != null && INVITATION_TOKEN_PATTERN.test(value)
}

export function invitationPath(slug: string, invitationToken: string) {
  return `/org/${slug}/invitation?token=${encodeURIComponent(invitationToken)}`
}

/**
 * Better Auth decides when to send, but knows nothing about organizations. The
 * slug rides along in the callback it echoes back, so the mail can be branded
 * and the link can land on the tenant the request came from.
 *
 * Someone resetting a password in order to accept an invitation sends the
 * invitation along too, so the mail can return them to it. Without it the reset
 * ends on the login page, which refuses anyone who is not a member yet.
 */
export function organizationCallback(slug: string, invitationToken?: string) {
  return isInvitationToken(invitationToken)
    ? invitationPath(slug, invitationToken)
    : `/org/${slug}`
}

function callbackOf(url: string) {
  return URL.parse(url)?.searchParams.get("callbackURL")
}

export function organizationSlugFromAuthUrl(url: string) {
  const slug = callbackOf(url)?.match(/^\/org\/([^/?#]+)/)?.[1]

  return slug && SLUG_PATTERN.test(slug) ? slug : env.rootOrganization.slug
}

export function invitationTokenFromAuthUrl(url: string) {
  const callback = callbackOf(url)
  const token = callback
    ? URL.parse(callback, "http://placeholder")?.searchParams.get("token")
    : null

  return isInvitationToken(token) ? token : null
}

export function verifyEmailLink(slug: string, token: string) {
  return absoluteUrl(
    `/org/${slug}/verify-email?token=${encodeURIComponent(token)}`
  )
}

export function resetPasswordLink(
  slug: string,
  token: string,
  invitationToken?: string | null
) {
  const invitation = isInvitationToken(invitationToken)
    ? `&invitation=${encodeURIComponent(invitationToken)}`
    : ""

  return absoluteUrl(
    `/org/${slug}/reset-password?token=${encodeURIComponent(token)}${invitation}`
  )
}
