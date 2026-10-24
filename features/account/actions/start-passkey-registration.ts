"use server"

import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser"
import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createPasswordConfirmationSchema } from "@/features/account/schemas/account"
import type { PasswordConfirmationInput } from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import { clientAddress } from "@/features/shared/lib/client-address"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { QueryResult } from "@/features/shared/types"

const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

/**
 * The challenge for adding a passkey. A passkey is a way in that outlives the
 * session, so the password is asked for first: a borrowed or stolen session
 * alone cannot plant one. The plugin binds the challenge to this account and
 * this browser through a signed cookie, and additionally requires a session
 * that was signed in recently.
 */
export async function startPasskeyRegistration(
  input: PasswordConfirmationInput
): Promise<QueryResult<PublicKeyCredentialCreationOptionsJSON>> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const { user } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsed = createPasswordConfirmationSchema(t).safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("validation.currentPasswordRequired") }
  }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const actor = auditActorFromUser(user)
  const target = { type: "user", id: user.id, label: user.name }
  const accountSourceKey = `account:passkey:${user.id}|${source ?? "unknown"}`

  const throttle = await consumeRateLimit(
    accountSourceKey,
    ACCOUNT_SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    await recordAuditEvent({
      action: "account.passkey_added",
      outcome: "denied",
      actor,
      target,
      reason: "Too many attempts",
    })

    return {
      success: false,
      error: t("errors.tooManyAttempts", {
        minutes: Math.ceil((throttle.retryAfter ?? 60) / 60),
      }),
    }
  }

  try {
    await auth.api.verifyPassword({
      body: { password: parsed.data.currentPassword },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.passkey_added",
      outcome: "failure",
      actor,
      target,
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: t("errors.incorrectPassword") }
  }

  await resetRateLimit(accountSourceKey)

  try {
    const options = await auth.api.generatePasskeyRegistrationOptions({
      headers: requestHeaders,
    })

    return {
      success: true,
      data: options as PublicKeyCredentialCreationOptionsJSON,
    }
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    return {
      success: false,
      error:
        error.body?.code === "SESSION_NOT_FRESH"
          ? t("errors.passkeySessionNotFresh")
          : t("errors.passkeyNotStarted"),
    }
  }
}
