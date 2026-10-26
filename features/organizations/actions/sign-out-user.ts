"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { recordAuditEvent } from "@/features/audit"
import { authorizeUserAdministration } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import {
  oauthAccessToken,
  oauthRefreshToken,
  session,
} from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// Every browser session, and everything applications were issued on them, so a
// stolen session or a lost device stops working everywhere at once.
export async function signOutUser(userId: string): Promise<ActionResult> {
  const t = await getTranslations("organizations.userAdmin.errors")
  const authorization = await authorizeUserAdministration({
    action: "user.signed_out",
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
  await db.transaction(async (tx) => {
    await tx
      .delete(oauthAccessToken)
      .where(eq(oauthAccessToken.userId, target.id))
    await tx
      .delete(oauthRefreshToken)
      .where(eq(oauthRefreshToken.userId, target.id))
    const ended = await tx
      .delete(session)
      .where(eq(session.userId, target.id))
      .returning({ id: session.id })
    await recordAuditEvent(
      {
        action: "user.signed_out",
        actor,
        target: { type: "user", id: target.id, label: target.name },
        metadata: { count: ended.length },
      },
      tx
    )
  })

  revalidateEverywhere()

  return { success: true }
}
