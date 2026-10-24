"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createChangePasswordSchema } from "@/features/account/schemas/account"
import type { ChangePasswordInput } from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendPasswordChangedNotice,
} from "@/features/notifications"
import { clientAddress } from "@/features/shared/lib/client-address"
import { checkPasswordAgainstBreaches } from "@/features/shared/lib/pwned-passwords"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

// The current password is a credential being guessed here exactly as at
// sign-in, so it gets the same budget, keyed on the account and the source
// together: keyed on the account alone, anyone could lock its owner out.
const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

export async function changePassword(
  input: ChangePasswordInput
): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const { user, memberships } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  // The account's own name and address are known inputs whatever the form
  // sent, so a password built from them is refused here too.
  const parsed = await createChangePasswordSchema(t).safeParseAsync({
    ...input,
    name: user.name,
    email: user.email,
  })
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? t("errors.chooseDifferentPassword"),
    }
  }

  const { currentPassword, password, revokeOtherSessions } = parsed.data
  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const actor = auditActorFromUser(user)
  const target = { type: "user", id: user.id, label: user.name }

  // Judged before the budget is touched, as on reset: being told to choose a
  // better password is not a guess at the current one.
  const breach = await checkPasswordAgainstBreaches(password, source)
  if (!breach.ok) return { success: false, error: breach.error }

  const accountSourceKey = `account:password:${user.id}|${source ?? "unknown"}`
  const throttle = await consumeRateLimit(
    accountSourceKey,
    ACCOUNT_SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    await recordAuditEvent({
      action: "account.password_changed",
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
    // With `revokeOtherSessions` Better Auth ends every session and issues this
    // browser a new one, so only the person changing it stays signed in.
    await auth.api.changePassword({
      body: { currentPassword, newPassword: password, revokeOtherSessions },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.password_changed",
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
          : t("errors.passwordNotChanged"),
    }
  }

  await resetRateLimit(accountSourceKey)
  await recordAuditEvent({
    action: "account.password_changed",
    actor,
    target,
    metadata: { otherSessionsRevoked: revokeOtherSessions },
  })
  await noticeAccountHolder({ user, memberships }, (notice) =>
    sendPasswordChangedNotice({
      ...notice,
      otherSessionsRevoked: revokeOtherSessions,
    })
  )

  return { success: true }
}
