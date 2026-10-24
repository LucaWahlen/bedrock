import { parseSetCookieHeader } from "better-auth/cookies"
import { getTranslations } from "next-intl/server"
import { cookies } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { settleSignIn } from "@/features/auth/actions/settle-sign-in"
import type {
  EstablishedSignIn,
  LoginDestination,
  LoginOrganization,
} from "@/features/auth/types"
import { noticeSignIn } from "@/features/notifications"
import type { organizationStatus } from "@/features/shared/lib/db/schema"
import {
  recordSignIn,
  type SignInMethod,
} from "@/features/shared/lib/telemetry/metrics"

export type SignInTarget = LoginOrganization & {
  status: (typeof organizationStatus.enumValues)[number]
}

// Whatever the session's own call set on the response is taken back, so a
// refused browser is left holding nothing, not a cookie for a deleted row.
async function forgetCookies(setCookieHeaders: string[]) {
  const cookieStore = await cookies()
  for (const cookie of setCookieHeaders) {
    for (const cookieName of parseSetCookieHeader(cookie).keys()) {
      cookieStore.delete(cookieName)
    }
  }
}

/**
 * The one way a sign-in ends, whichever factor proved it: a password alone, a
 * password and a second factor, or a passkey. The session already exists here;
 * this decides whether it may stay, records the outcome, and revokes it when it
 * may not.
 *
 * Deliberately not a Server Action: it trusts the caller to have just
 * established `signIn`, which only the sign-in actions themselves can say.
 */
export async function finishSignIn({
  signIn,
  target,
  method,
  metadata,
}: {
  signIn: EstablishedSignIn
  target?: SignInTarget
  method: SignInMethod
  // Recorded on every event this produces, such as which factors were used.
  metadata?: Record<string, unknown>
}): Promise<
  { success: true; next: LoginDestination } | { success: false; error: string }
> {
  const actor = auditActorFromUser(signIn.user)
  const organization = target
    ? { id: target.id, name: target.name, slug: target.slug }
    : undefined

  if (!target) {
    recordSignIn("success", method)
    // Before the event, so this sign-in is not the history it is judged by.
    await noticeSignIn({
      sessionToken: signIn.sessionToken,
      recipient: signIn.user,
    })
    await recordAuditEvent({
      action: "authentication.login",
      actor,
      organization,
      metadata,
    })

    return { success: true, next: "organization" }
  }

  const decision = await settleSignIn(signIn.sessionToken, target.id)

  if (!decision.allowed) {
    recordSignIn("denied", method)
    await forgetCookies(signIn.setCookieHeaders)
    await recordAuditEvent({
      action: "authentication.login",
      outcome: "denied",
      actor,
      organization,
      reason: decision.reason,
      metadata,
    })

    const t = await getTranslations("auth.errors")

    return { success: false, error: t(decision.refusal) }
  }

  recordSignIn("success", method)
  await noticeSignIn({
    sessionToken: signIn.sessionToken,
    recipient: signIn.user,
    // Not yet a member there, so its settings are not theirs to open.
    organization: decision.pendingInvitation ? null : organization,
  })
  await recordAuditEvent({
    action: "authentication.login",
    actor,
    organization,
    metadata: decision.pendingInvitation
      ? { ...metadata, pendingInvitation: true }
      : metadata,
  })

  return { success: true, next: decision.next }
}
