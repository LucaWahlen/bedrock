"use server"

import { getTranslations } from "next-intl/server"

import { recordAuditEvent } from "@/features/audit"
import { authorizeUserAdministration } from "@/features/auth"
import {
  noticeAccountHolder,
  sendTwoFactorDisabledNotice,
} from "@/features/notifications"
import { homeOrganizationSlug } from "@/features/organizations/lib/home-organization"
import { resetSecondFactor } from "@/features/organizations/lib/second-factor-reset"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// For someone who has lost their authenticator and their backup codes. It
// weakens the account, so the administrator needs a second factor of their own,
// and the account holder is told straight away.
export async function resetUserSecondFactor(
  userId: string
): Promise<ActionResult> {
  const t = await getTranslations("organizations.userAdmin.errors")
  const authorization = await authorizeUserAdministration({
    action: "user.two_factor_reset",
    userId,
    requireSecondFactor: true,
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
  const reset = await db.transaction(async (tx) => {
    if (!(await resetSecondFactor(tx, target.id))) return false
    await recordAuditEvent(
      {
        action: "user.two_factor_reset",
        actor,
        target: { type: "user", id: target.id, label: target.name },
        metadata: { email: target.email },
      },
      tx
    )
    return true
  })
  if (!reset) return { success: false, error: t("failed") }

  const home = await homeOrganizationSlug(target.id)
  await noticeAccountHolder(
    {
      user: { name: target.name, email: target.email },
      memberships: home ? [{ slug: home, status: "active" }] : [],
    },
    sendTwoFactorDisabledNotice
  )

  revalidateEverywhere()

  return { success: true }
}
