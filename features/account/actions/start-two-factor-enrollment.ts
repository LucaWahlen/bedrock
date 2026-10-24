"use server"

import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createPasswordConfirmationSchema } from "@/features/account/schemas/account"
import type {
  PasswordConfirmationInput,
  TwoFactorEnrollment,
} from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import { clientAddress } from "@/features/shared/lib/client-address"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { user as userTable } from "@/features/shared/lib/db/schema"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { QueryResult } from "@/features/shared/types"

const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

/**
 * The first half of turning on two-factor authentication: a new secret for the
 * authenticator app and a set of backup codes. Nothing is enforced yet; that
 * waits for `confirmTwoFactorEnrollment` to see a code the app produced, so a
 * scan that went wrong cannot lock anyone out.
 */
export async function startTwoFactorEnrollment(
  input: PasswordConfirmationInput
): Promise<QueryResult<TwoFactorEnrollment>> {
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

  // Starting over on an account that already has it would replace the secret
  // without the new one ever being verified.
  const [account] = await db
    .select({ twoFactorEnabled: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1)
  if (account?.twoFactorEnabled) {
    return {
      success: false,
      error: t("errors.twoFactorAlreadyEnabled"),
    }
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
    const enrollment = await auth.api.enableTwoFactor({
      body: {
        password: parsed.data.currentPassword,
        issuer: env.rootOrganization.name,
      },
      headers: requestHeaders,
    })
    if (!("totpURI" in enrollment) || !enrollment.totpURI) {
      throw new Error("Two-factor enrolment returned no TOTP URI")
    }

    await resetRateLimit(accountSourceKey)

    return {
      success: true,
      data: {
        totpURI: enrollment.totpURI,
        secret: new URL(enrollment.totpURI).searchParams.get("secret") ?? "",
        backupCodes: enrollment.backupCodes ?? [],
      },
    }
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
      error:
        error.body?.code === "INVALID_PASSWORD"
          ? t("errors.incorrectPassword")
          : t("errors.twoFactorSetupFailed"),
    }
  }
}
