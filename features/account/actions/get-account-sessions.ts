"use server"

import { and, desc, eq, gt } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import type { AccountSession } from "@/features/account/types"
import { describeUserAgent } from "@/features/account/utils/user-agent"
import { auth, getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { session } from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

// Read from the table rather than through Better Auth's `listSessions`, which
// refuses any session older than its freshness window and would hide the list
// from someone who simply stayed signed in. Only this user's live sessions are
// read, and the tokens never leave the server.
export async function getAccountSessions(): Promise<
  QueryResult<AccountSession[]>
> {
  const t = await getTranslations("common")
  const { user } = await getAccessContext()
  if (!user) return { success: false, error: t("errors.notSignedIn") }

  const current = await auth.api.getSession({ headers: await headers() })
  if (!current || current.user.id !== user.id) {
    return { success: false, error: t("errors.notSignedIn") }
  }

  const rows = await db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    })
    .from(session)
    .where(and(eq(session.userId, user.id), gt(session.expiresAt, new Date())))
    .orderBy(desc(session.updatedAt))

  const sessions = rows.map((row) => ({
    id: row.id,
    device: describeUserAgent(row.userAgent),
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.updatedAt.toISOString(),
    current: row.id === current.session.id,
  }))

  // The one in use first, then the rest by how recently they were seen.
  sessions.sort((a, b) => Number(b.current) - Number(a.current))

  return { success: true, data: sessions }
}
