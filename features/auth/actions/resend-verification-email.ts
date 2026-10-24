"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { auth } from "@/features/auth/lib/auth"
import { organizationCallback } from "@/features/auth/lib/email-links"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const ACCOUNT_LIMIT = { window: 60 * 60, max: 5 }

/**
 * Only ever sends to the address on the caller's own session, so this cannot be
 * turned into a way of mailing somebody else.
 */
export async function resendVerificationEmail(
  organizationSlug: string
): Promise<ActionResult> {
  const [t, access] = await Promise.all([
    getTranslations("auth"),
    getAccessContext(),
  ])
  const currentUser = access.user
  if (!currentUser) {
    return { success: false, error: t("errors.signInFirst") }
  }
  if (currentUser.emailVerified) {
    return { success: false, error: t("errors.alreadyConfirmed") }
  }

  const throttle = await consumeRateLimit(
    `email-verification:send:${currentUser.id}`,
    ACCOUNT_LIMIT
  )
  if (!throttle.allowed) {
    return {
      success: false,
      error: t("errors.tooManyEmails", {
        minutes: Math.ceil((throttle.retryAfter ?? 60) / 60),
      }),
    }
  }

  const slug =
    access.memberships.find(
      (membership) => membership.slug === organizationSlug
    )?.slug ?? organizationSlug

  try {
    await auth.api.sendVerificationEmail({
      body: {
        email: currentUser.email,
        callbackURL: organizationCallback(slug),
      },
      headers: await headers(),
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    return { success: false, error: t("errors.emailNotSent") }
  }

  return { success: true }
}
