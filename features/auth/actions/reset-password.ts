"use server"

import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth/lib/auth"
import { createNewPasswordSchema } from "@/features/auth/schemas/sign-up"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { verification } from "@/features/shared/lib/db/schema"
import { checkPasswordAgainstBreaches } from "@/features/shared/lib/pwned-passwords"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const SOURCE_LIMIT = { window: 60 * 60, max: 20 }

export async function resetPassword(
  token: string,
  password: string
): Promise<ActionResult> {
  const t = await getTranslations("auth")
  const parsed = await createNewPasswordSchema(t).safeParseAsync({ password })
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? t("errors.chooseDifferentPassword"),
    }
  }

  const source = clientAddress(await headers())

  // Judged with the rest of the password's quality, before the redemption
  // budget is touched. That budget exists to stop reset tokens being guessed,
  // and being told to pick a better password is not a guess.
  const breach = await checkPasswordAgainstBreaches(
    parsed.data.password,
    source
  )
  if (!breach.ok) return { success: false, error: breach.error }

  const throttle = await consumeRateLimit(
    `password-reset:redeem:${source ?? "unknown"}`,
    SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    return { success: false, error: t("errors.tooManyRequestsLater") }
  }

  // Read before it is spent, so the event can name whose password changed.
  const [pending] = await db
    .select({ userId: verification.value })
    .from(verification)
    .where(eq(verification.identifier, `reset-password:${token}`))
    .limit(1)

  try {
    await auth.api.resetPassword({ body: { token, newPassword: password } })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "authentication.password_reset",
      outcome: "failure",
      actor: { type: "anonymous" },
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: t("errors.resetLinkInvalid") }
  }

  await recordAuditEvent({
    action: "authentication.password_reset",
    actor: pending
      ? { type: "user", userId: pending.userId }
      : { type: "anonymous" },
    target: pending ? { type: "user", id: pending.userId } : undefined,
  })

  return { success: true }
}
