"use server"

import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { getFormatter, getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { getTwoFactorRequirements } from "@/features/account/actions/get-two-factor-requirements"
import { verifySecondFactor } from "@/features/account/actions/verify-second-factor"
import { createDisableTwoFactorSchema } from "@/features/account/schemas/account"
import type { DisableTwoFactorInput } from "@/features/account/types"
import { authenticatorRemovalRefusal } from "@/features/account/utils/second-factor-requirement"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendTwoFactorDisabledNotice,
} from "@/features/notifications"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { passkey } from "@/features/shared/lib/db/schema"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

/**
 * Turns two-factor authentication off. Both factors are asked for: the password
 * alone is exactly what a second factor exists to not be enough. Better Auth
 * deletes the secret and backup codes and replaces this browser's session.
 */
export async function disableTwoFactor(
  input: DisableTwoFactorInput
): Promise<ActionResult> {
  const [t, tc, format] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
    getFormatter(),
  ])
  const { user, memberships } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsed = createDisableTwoFactorSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? t("errors.passwordAndCodeRequired"),
    }
  }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const actor = auditActorFromUser(user)
  const target = { type: "user", id: user.id, label: user.name }
  const accountSourceKey = `account:two-factor:${user.id}|${source ?? "unknown"}`

  // Turning off the only factor an organization requires would lock its
  // member out of it, so that is refused before any credential is asked for.
  const [requiredBy, [remainingPasskey]] = await Promise.all([
    getTwoFactorRequirements(),
    db
      .select({ id: passkey.id })
      .from(passkey)
      .where(eq(passkey.userId, user.id))
      .limit(1),
  ])
  const refusal = authenticatorRemovalRefusal(
    {
      twoFactorEnabled: true,
      passkeyCount: remainingPasskey ? 1 : 0,
      requiredBy,
    },
    t,
    format
  )
  if (refusal) {
    await recordAuditEvent({
      action: "account.two_factor_disabled",
      outcome: "denied",
      actor,
      target,
      reason: "Required by an organization",
      metadata: { requiredBy },
    })

    return { success: false, error: refusal }
  }

  const throttle = await consumeRateLimit(
    accountSourceKey,
    ACCOUNT_SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    await recordAuditEvent({
      action: "account.two_factor_disabled",
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
      action: "account.two_factor_disabled",
      outcome: "failure",
      actor,
      target,
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: t("errors.incorrectPassword") }
  }

  const secondFactor = await verifySecondFactor(parsed.data.code)
  if (!secondFactor.success) {
    await recordAuditEvent({
      action: "account.two_factor_disabled",
      outcome: "failure",
      actor,
      target,
      reason: "Invalid second factor",
    })

    return secondFactor
  }

  try {
    await auth.api.disableTwoFactor({
      body: { password: parsed.data.currentPassword },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    return {
      success: false,
      error: t("errors.twoFactorNotDisabled"),
    }
  }

  await resetRateLimit(accountSourceKey)
  await recordAuditEvent({
    action: "account.two_factor_disabled",
    actor,
    target,
  })
  await noticeAccountHolder({ user, memberships }, sendTwoFactorDisabledNotice)

  return { success: true }
}
