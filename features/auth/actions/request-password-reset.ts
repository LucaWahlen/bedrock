"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth/lib/auth"
import { organizationCallback } from "@/features/auth/lib/email-links"
import { createEmailSchema } from "@/features/auth/schemas/sign-up"
import { clientAddress } from "@/features/shared/lib/client-address"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const ACCOUNT_LIMIT = { window: 60 * 60, max: 5 }
const SOURCE_LIMIT = { window: 60 * 60, max: 20 }

/**
 * Always reports success. Whether an address has an account is not something a
 * password form should be able to answer.
 */
export async function requestPasswordReset(
  email: string,
  organizationSlug: string,
  invitationToken?: string
): Promise<ActionResult> {
  const t = await getTranslations("auth")
  const parsed = createEmailSchema(t).safeParse({ email })
  if (!parsed.success) {
    return { success: false, error: t("validation.emailInvalid") }
  }

  const address = parsed.data.email.toLowerCase()
  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const attempts = await Promise.all([
    consumeRateLimit(`password-reset:account:${address}`, ACCOUNT_LIMIT),
    source
      ? consumeRateLimit(`password-reset:source:${source}`, SOURCE_LIMIT)
      : { allowed: true, retryAfter: null },
  ])

  if (attempts.some((attempt) => !attempt.allowed)) {
    // Still not a distinguishable answer: a throttled caller learns only that
    // it asked too often.
    return { success: true }
  }

  await recordAuditEvent({
    action: "authentication.password_reset_requested",
    actor: { type: "anonymous", email: address },
  })

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: address,
        redirectTo: organizationCallback(organizationSlug, invitationToken),
      },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error
  }

  return { success: true }
}
