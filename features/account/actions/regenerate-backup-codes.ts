"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createPasswordConfirmationSchema } from "@/features/account/schemas/account"
import type { PasswordConfirmationInput } from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendBackupCodesRegeneratedNotice,
} from "@/features/notifications"
import { clientAddress } from "@/features/shared/lib/client-address"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { QueryResult } from "@/features/shared/types"

const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

/**
 * A new set of backup codes, replacing every old one, used or not. Returned
 * once for the person to save; the server keeps them only encrypted.
 */
export async function regenerateBackupCodes(
  input: PasswordConfirmationInput
): Promise<QueryResult<string[]>> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const { user, memberships } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsed = createPasswordConfirmationSchema(t).safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("validation.currentPasswordRequired") }
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
      action: "account.backup_codes_regenerated",
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
    // Refuses an account without two-factor authentication on, and checks the
    // password against the account itself.
    const { backupCodes } = await auth.api.generateBackupCodes({
      body: { password: parsed.data.currentPassword },
      headers: requestHeaders,
    })

    await resetRateLimit(accountSourceKey)
    await recordAuditEvent({
      action: "account.backup_codes_regenerated",
      actor,
      target,
    })
    await noticeAccountHolder(
      { user, memberships },
      sendBackupCodesRegeneratedNotice
    )

    return { success: true, data: backupCodes }
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.backup_codes_regenerated",
      outcome: "failure",
      actor,
      target,
      reason: error.body?.message ?? error.message,
    })

    return {
      success: false,
      error:
        error.body?.code === "INVALID_PASSWORD"
          ? t("errors.incorrectPassword")
          : t("errors.backupCodesNotCreated"),
    }
  }
}
