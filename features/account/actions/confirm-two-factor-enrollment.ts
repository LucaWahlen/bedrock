"use server"

import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createEnrollmentCodeSchema } from "@/features/account/schemas/account"
import type { EnrollmentCodeInput } from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendTwoFactorEnabledNotice,
} from "@/features/notifications"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { twoFactor, user as userTable } from "@/features/shared/lib/db/schema"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

/**
 * The second half of turning on two-factor authentication: a code from the
 * newly configured app proves it works, and only then is a second factor
 * required at sign-in. Better Auth replaces this browser's session as it does,
 * so the new one is the only one that knows about it.
 */
export async function confirmTwoFactorEnrollment(
  input: EnrollmentCodeInput
): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const { user, memberships } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsed = createEnrollmentCodeSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("validation.enrollmentCode"),
    }
  }

  const [account] = await db
    .select({
      twoFactorEnabled: userTable.twoFactorEnabled,
      pending: twoFactor.id,
    })
    .from(userTable)
    .leftJoin(twoFactor, eq(twoFactor.userId, userTable.id))
    .where(eq(userTable.id, user.id))
    .limit(1)
  if (account?.twoFactorEnabled) {
    return {
      success: false,
      error: t("errors.twoFactorAlreadyEnabled"),
    }
  }
  if (!account?.pending) {
    return { success: false, error: t("errors.twoFactorNotStarted") }
  }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const actor = auditActorFromUser(user)
  const target = { type: "user", id: user.id, label: user.name }
  const accountSourceKey = `account:two-factor:${user.id}|${source ?? "unknown"}`

  const throttle = await consumeRateLimit(
    accountSourceKey,
    ACCOUNT_SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    await recordAuditEvent({
      action: "account.two_factor_enabled",
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
    await auth.api.verifyTOTP({
      body: { code: parsed.data.code },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.two_factor_enabled",
      outcome: "failure",
      actor,
      target,
      reason: error.body?.message ?? error.message,
    })

    return {
      success: false,
      error: t("errors.twoFactorCodeInvalid"),
    }
  }

  await resetRateLimit(accountSourceKey)
  await recordAuditEvent({
    action: "account.two_factor_enabled",
    actor,
    target,
    metadata: { method: "totp" },
  })
  await noticeAccountHolder({ user, memberships }, sendTwoFactorEnabledNotice)

  return { success: true }
}
