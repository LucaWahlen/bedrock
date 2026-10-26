"use server"

import { getTranslations } from "next-intl/server"

import { recordAuditEvent } from "@/features/audit"
import { requestPasswordReset } from "@/features/auth"
import { authorizeUserAdministration } from "@/features/auth"
import { homeOrganizationSlug } from "@/features/organizations/lib/home-organization"
import type { ActionResult } from "@/features/shared/types"

// The supported way to help someone locked out: the link goes to the address
// on the account, so root can start a recovery but never finish one.
export async function sendUserPasswordReset(
  userId: string
): Promise<ActionResult> {
  const t = await getTranslations("organizations.userAdmin.errors")
  const authorization = await authorizeUserAdministration({
    action: "user.password_reset_sent",
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
  const slug = await homeOrganizationSlug(target.id)
  if (!slug) return { success: false, error: t("failed") }

  // Rate limited per account by the same path the sign-in page uses.
  const sent = await requestPasswordReset(target.email, slug)
  if (!sent.success) return sent

  await recordAuditEvent({
    action: "user.password_reset_sent",
    actor,
    target: { type: "user", id: target.id, label: target.name },
    metadata: { email: target.email },
  })

  return { success: true }
}
