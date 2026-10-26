"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { recordAuditEvent } from "@/features/audit"
import { authorizeUserAdministration } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// For someone whose verification mail never arrives. Root vouches for the
// address instead of the inbox, and the audit event says who did.
export async function markUserVerified(userId: string): Promise<ActionResult> {
  const t = await getTranslations("organizations.userAdmin.errors")
  const authorization = await authorizeUserAdministration({
    action: "user.email_verified",
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

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(and(eq(user.id, target.id), eq(user.email, target.email)))
    await recordAuditEvent(
      {
        action: "user.email_verified",
        actor,
        target: { type: "user", id: target.id, label: target.name },
        metadata: { email: target.email },
      },
      tx
    )
  })

  revalidateEverywhere()

  return { success: true }
}
