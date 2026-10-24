"use server"

import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createSecondFactorCodeSchema } from "@/features/account/schemas/account"
import { auth, getAccessContext } from "@/features/auth"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { user as userTable } from "@/features/shared/lib/db/schema"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

// The same budget as a sign-in's second step: a code is guessed here exactly as
// there, and keyed on the account and source together so nobody else can spend
// it.
const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

const TOTP = /^\d{6}$/

/**
 * Proves the signed-in person still holds their second factor, before
 * something that cannot be undone. Six digits are checked as an authenticator
 * code; anything else as a backup code, which is spent by being used.
 *
 * Only ever about the caller's own account, so it answers nothing a session
 * holder could not find out by signing in.
 */
export async function verifySecondFactor(code: string): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const { user } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsed = createSecondFactorCodeSchema(t).safeParse(code)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("validation.codeRequired"),
    }
  }

  // Checked first: on an account still enrolling, a valid code would finish
  // the enrolment as a side effect, unaudited.
  const [account] = await db
    .select({ twoFactorEnabled: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1)
  if (!account?.twoFactorEnabled) {
    return {
      success: false,
      error: t("errors.twoFactorNotEnabled"),
    }
  }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const accountSourceKey = `account:second-factor:${user.id}|${source ?? "unknown"}`
  const throttle = await consumeRateLimit(
    accountSourceKey,
    ACCOUNT_SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    return {
      success: false,
      error: t("errors.tooManyAttempts", {
        minutes: Math.ceil((throttle.retryAfter ?? 60) / 60),
      }),
    }
  }

  const value = parsed.data.replace(/\s+/g, "")

  try {
    if (TOTP.test(value)) {
      await auth.api.verifyTOTP({
        body: { code: value },
        headers: requestHeaders,
      })
    } else {
      await auth.api.verifyBackupCode({
        body: { code: parsed.data, disableSession: true },
        headers: requestHeaders,
      })
    }
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    return {
      success: false,
      error: t("errors.secondFactorInvalid"),
    }
  }

  await resetRateLimit(accountSourceKey)

  return { success: true }
}
