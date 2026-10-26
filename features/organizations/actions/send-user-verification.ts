"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"

import { recordAuditEvent } from "@/features/audit"
import { auth, organizationCallback } from "@/features/auth"
import { authorizeUserAdministration } from "@/features/auth"
import { homeOrganizationSlug } from "@/features/organizations/lib/home-organization"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const ACCOUNT_LIMIT = { window: 60 * 60, max: 3 }

// Sends the person's own verification mail again, to the address on the
// account. Root never learns the link.
export async function sendUserVerification(
  userId: string
): Promise<ActionResult> {
  const t = await getTranslations("organizations.userAdmin.errors")
  const authorization = await authorizeUserAdministration({
    action: "user.verification_sent",
    userId,
    requireSecondFactor: false,
    errors: {
      denied: t("denied"),
      secondFactor: t("secondFactor"),
      rootMember: t("rootMember"),
    },
  })
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { actor, target } = authorization
  if (target.emailVerified) {
    return { success: false, error: t("alreadyVerified") }
  }

  const throttle = await consumeRateLimit(
    `user-admin:verification:${target.id}`,
    ACCOUNT_LIMIT
  )
  if (!throttle.allowed) return { success: false, error: t("tooOften") }

  const slug = await homeOrganizationSlug(target.id)
  if (!slug) return { success: false, error: t("failed") }

  // Without the administrator's session: with one, Better Auth only sends to
  // the signed-in account's own address and refuses any other.
  try {
    await auth.api.sendVerificationEmail({
      body: { email: target.email, callbackURL: organizationCallback(slug) },
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error
    return { success: false, error: t("failed") }
  }
  await recordAuditEvent({
    action: "user.verification_sent",
    actor,
    target: { type: "user", id: target.id, label: target.name },
    metadata: { email: target.email },
  })

  return { success: true }
}
