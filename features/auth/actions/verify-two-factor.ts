"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { getPendingTwoFactor } from "@/features/auth/actions/get-pending-two-factor"
import { isAccountDisabledError } from "@/features/auth/lib/account-disabled"
import { auth } from "@/features/auth/lib/auth"
import { finishSignIn } from "@/features/auth/lib/finish-sign-in"
import { refuseDisabledSignIn } from "@/features/auth/lib/refuse-disabled-sign-in"
import { createTwoFactorSchema } from "@/features/auth/schemas/two-factor"
import type { TwoFactorInput, TwoFactorResult } from "@/features/auth/types"
import { getOrganizationBySlug } from "@/features/organizations"
import { clientAddress } from "@/features/shared/lib/client-address"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import { recordSignIn } from "@/features/shared/lib/telemetry/metrics"

// On top of the plugin's own limits (five tries per challenge, ten failures in
// a row lock the account): keyed on the account and the source together, like
// the password, so nobody can lock an owner out from somewhere else. The source
// budget is the login form's, so the two steps share one allowance.
const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }
const SOURCE_LIMIT = { window: 15 * 60, max: 30 }

// The plugin's lockout after too many wrong codes in a row.
const ACCOUNT_LOCK_MINUTES = 15

// Errors that end the challenge rather than the attempt: only a new sign-in
// helps.
const CHALLENGE_ENDED = new Set([
  "INVALID_TWO_FACTOR_COOKIE",
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
])

/**
 * The second step of a password sign-in. Completing it creates the session,
 * which then passes the same gate as every other sign-in.
 */
export async function verifyTwoFactor(
  input: TwoFactorInput,
  organizationSlug?: string
): Promise<TwoFactorResult> {
  const t = await getTranslations("auth")
  const parsed = createTwoFactorSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.enterCode"),
    }
  }

  const pending = await getPendingTwoFactor()
  if (!pending) {
    return { success: false, error: t("errors.signInExpired"), expired: true }
  }

  const { method, code, trustDevice } = parsed.data
  const target = organizationSlug
    ? await getOrganizationBySlug(organizationSlug)
    : undefined
  const auditedOrganization = target
    ? { id: target.id, name: target.name, slug: target.slug }
    : undefined
  const actor = auditActorFromUser(pending)
  const metadata = { secondFactor: method }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const accountSourceKey = `two-factor:account-source:${pending.id}|${source ?? "unknown"}`
  const attempts = await Promise.all([
    consumeRateLimit(accountSourceKey, ACCOUNT_SOURCE_LIMIT),
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
      actor,
      organization: auditedOrganization,
      reason: "Too many verification attempts",
      metadata,
    })

    return {
      success: false,
      error: t("errors.tooManyRequests", {
        minutes: Math.ceil((blocked.retryAfter ?? 60) / 60),
      }),
    }
  }

  try {
    const verified =
      method === "totp"
        ? await auth.api.verifyTOTP({
            body: { code, trustDevice },
            headers: requestHeaders,
            returnHeaders: true,
          })
        : await auth.api.verifyBackupCode({
            body: { code, trustDevice },
            headers: requestHeaders,
            returnHeaders: true,
          })

    const { token, user } = verified.response
    if (!token) throw new Error("Two-factor verification created no session")

    await resetRateLimit(accountSourceKey)

    return await finishSignIn({
      signIn: {
        user,
        sessionToken: token,
        setCookieHeaders: verified.headers.getSetCookie(),
      },
      target,
      method: "password",
      metadata,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    // Disabled while the challenge was open: the code was right, the account
    // still may not hold a session.
    if (isAccountDisabledError(error)) {
      return refuseDisabledSignIn({
        actor,
        organization: auditedOrganization,
        method: "password",
        metadata,
      })
    }

    const errorCode = error.body?.code
    recordSignIn("failure", "password")
    await recordAuditEvent({
      action: "authentication.login",
      outcome: "failure",
      actor,
      organization: auditedOrganization,
      reason: error.body?.message ?? error.message,
      metadata,
    })

    if (errorCode && CHALLENGE_ENDED.has(errorCode)) {
      return { success: false, error: t("errors.signInExpired"), expired: true }
    }

    if (errorCode === "ACCOUNT_TEMPORARILY_LOCKED") {
      return {
        success: false,
        error: t("errors.tooManyCodes", { minutes: ACCOUNT_LOCK_MINUTES }),
      }
    }

    return {
      success: false,
      error:
        method === "totp"
          ? t("errors.totpInvalid")
          : t("errors.backupCodeInvalid"),
    }
  }
}
