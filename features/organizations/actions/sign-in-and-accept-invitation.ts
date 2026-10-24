"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { recordAuditEvent } from "@/features/audit"
import {
  auth,
  finishSignIn,
  isAccountDisabledError,
  refuseDisabledSignIn,
} from "@/features/auth"
import { claimInvitation } from "@/features/organizations/lib/claim-invitation"
import { invitationRefusalMessage } from "@/features/organizations/lib/invitation-display"
import { resolveInvitationByToken } from "@/features/organizations/lib/resolve-invitation"
import type { AcceptInvitationResult } from "@/features/organizations/types"
import { clientAddress } from "@/features/shared/lib/client-address"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import { recordSignIn } from "@/features/shared/lib/telemetry/metrics"

// The token names the account, so this is a password guess against a known
// address and is throttled at least as hard as the login form.
const INVITATION_LIMIT = { window: 15 * 60, max: 5 }
const SOURCE_LIMIT = { window: 15 * 60, max: 30 }

/**
 * Signing in and accepting in one step. Sending someone to the login page
 * instead would be a dead end: they are not a member yet, which is exactly what
 * the login form refuses.
 */
export async function signInAndAcceptInvitation(
  token: string,
  password: string
): Promise<AcceptInvitationResult> {
  if (!password) {
    return { success: false, error: "Enter your password" }
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
  if (!invited.recipientUserId) {
    return {
      success: false,
      error: "That address has no account yet",
    }
  }

  const auditedOrganization = {
    id: invited.organization.id,
    name: invited.organization.name,
    slug: invited.organization.slug,
  }
  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const attempts = await Promise.all([
    consumeRateLimit(
      `invitation:sign-in:${invited.id}|${source ?? "unknown"}`,
      INVITATION_LIMIT
    ),
    source
      ? consumeRateLimit(`login:source:${source}`, SOURCE_LIMIT)
      : { allowed: true, retryAfter: null },
  ])
  const blocked = attempts.find((attempt) => !attempt.allowed)

  if (blocked) {
    recordSignIn("rate_limited", "password")
    await recordAuditEvent({
      action: "authentication.login",
      outcome: "denied",
      actor: { type: "anonymous", email: invited.email },
      organization: auditedOrganization,
      reason: "Too many sign-in attempts",
    })

    return {
      success: false,
      error: `Too many attempts. Try again in ${Math.ceil((blocked.retryAfter ?? 60) / 60)} minutes.`,
    }
  }

  const actor = {
    type: "user" as const,
    userId: invited.recipientUserId,
    email: invited.email,
  }
  let signedIn: { id: string; name: string; email: string }
  try {
    // The address comes from the token, never from the form, so this cannot be
    // pointed at an account other than the one invited.
    const signIn = await auth.api.signInEmail({
      body: { email: invited.email, password },
      headers: requestHeaders,
      returnHeaders: true,
    })

    // A password alone is not a sign-in for an account with two-factor
    // authentication, so it cannot accept anything either. The second step
    // passes the sign-in gate, which sends an invited non-member back to the
    // invitation to accept it with the session that creates.
    if ("twoFactorRedirect" in signIn.response) {
      await recordAuditEvent({
        action: "authentication.two_factor_challenged",
        actor,
        organization: auditedOrganization,
      })

      return {
        success: true,
        slug: invited.organization.slug,
        next: "two-factor",
      }
    }

    // The same gate as every other sign-in, so it is noticed, measured and
    // audited alike. It lets an invited non-member through to the invitation,
    // which is accepted below with the session it leaves standing.
    const finished = await finishSignIn({
      signIn: {
        user: signIn.response.user,
        sessionToken: signIn.response.token,
        setCookieHeaders: signIn.headers.getSetCookie(),
      },
      target: invited.organization,
      method: "password",
    })
    if (!finished.success) return finished

    signedIn = signIn.response.user
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    // The password was right; the account may not sign in to accept anything.
    if (isAccountDisabledError(error)) {
      return refuseDisabledSignIn({
        actor,
        organization: auditedOrganization,
        method: "password",
      })
    }

    recordSignIn("failure", "password")
    await recordAuditEvent({
      action: "authentication.login",
      outcome: "failure",
      actor: { type: "anonymous", email: invited.email },
      organization: auditedOrganization,
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: "Incorrect password" }
  }

  // Not the access context: the new session cookie is on the response, not on
  // the request this server action was given.
  const claimed = await claimInvitation({
    invited,
    claimant: signedIn,
    via: "sign-in",
  })

  if (!claimed) {
    return { success: false, error: "That invitation is no longer pending" }
  }

  revalidateEverywhere()

  return { success: true, slug: invited.organization.slug }
}
