"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { sessionIdSchema } from "@/features/account/schemas/account"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { session } from "@/features/shared/lib/db/schema"
import type { ActionResult } from "@/features/shared/types"

// The id is the browser's only handle on a session; the delete is matched on
// the signed-in user as well, so naming someone else's session ends nothing.
export async function revokeSession(sessionId: string): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const parsed = sessionIdSchema.safeParse(sessionId)
  if (!parsed.success)
    return { success: false, error: t("errors.sessionNotFound") }

  const { user } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const current = await auth.api.getSession({ headers: await headers() })
  if (!current || current.user.id !== user.id) {
    return { success: false, error: tc("errors.notSignedIn") }
  }

  if (parsed.data === current.session.id) {
    return {
      success: false,
      error: t("errors.currentSession"),
    }
  }

  const [revoked] = await db
    .delete(session)
    .where(and(eq(session.id, parsed.data), eq(session.userId, user.id)))
    .returning({ id: session.id, userAgent: session.userAgent })

  if (!revoked) return { success: false, error: t("errors.sessionNotFound") }

  await recordAuditEvent({
    action: "account.session_revoked",
    actor: auditActorFromUser(user),
    target: { type: "session", id: revoked.id },
    metadata: { userAgent: revoked.userAgent },
  })

  return { success: true }
}
