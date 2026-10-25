"use server"

import { and, eq, ne } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { session } from "@/features/shared/lib/db/schema"
import { revokeSessionOAuthTokens } from "@/features/shared/lib/oauth-session-tokens"
import type { ActionResult } from "@/features/shared/types"

// Every session of the signed-in user except the one making the request.
export async function revokeOtherSessions(): Promise<ActionResult> {
  const t = await getTranslations("common")
  const { user } = await getAccessContext()
  if (!user) return { success: false, error: t("errors.notSignedIn") }

  const current = await auth.api.getSession({ headers: await headers() })
  if (!current || current.user.id !== user.id) {
    return { success: false, error: t("errors.notSignedIn") }
  }

  const others = and(
    eq(session.userId, user.id),
    ne(session.id, current.session.id)
  )
  // What applications were issued from those sessions ends with them.
  const ending = await db.select({ id: session.id }).from(session).where(others)
  await revokeSessionOAuthTokens(ending.map((row) => row.id))

  const revoked = await db
    .delete(session)
    .where(others)
    .returning({ id: session.id })

  if (revoked.length > 0) {
    await recordAuditEvent({
      action: "account.sessions_revoked",
      actor: auditActorFromUser(user),
      target: { type: "user", id: user.id, label: user.name },
      metadata: { count: revoked.length },
    })
  }

  return { success: true }
}
