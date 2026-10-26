import { and, inArray, isNull, lte, or } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import {
  oauthAccessToken,
  oauthRefreshToken,
  session,
  verification,
} from "@/features/shared/lib/db/schema"

const SESSION_BATCH = 500

/**
 * Removes what Better Auth only deletes when someone presents it: expired
 * sessions, OAuth tokens past their expiry, and spent verification values.
 * Each is refused once expired, so this changes no decision; it stops the
 * tables, rotated refresh tokens above all, from growing without bound.
 */
export async function housekeepSessionsAndTokens() {
  const now = new Date()
  const sessions = await deleteExpiredSessions(now)

  // A token with no expiry is one the provider refuses as expired anyway.
  const accessTokens = await db
    .delete(oauthAccessToken)
    .where(
      or(
        lte(oauthAccessToken.expiresAt, now),
        isNull(oauthAccessToken.expiresAt)
      )
    )
    .returning({ id: oauthAccessToken.id })
  // A revoked refresh token is kept until its own expiry, never sooner: until
  // then presenting it again after the reuse interval is what revokes its
  // whole family as stolen, and deleting it would turn that into a plain
  // refusal. Past its expiry the provider refuses it before looking at
  // revocation, so that is the earliest it stops mattering. Every rotation
  // issues a fresh row, so a family keeps at most one refresh lifetime of them.
  const refreshTokens = await db
    .delete(oauthRefreshToken)
    .where(
      or(
        lte(oauthRefreshToken.expiresAt, now),
        isNull(oauthRefreshToken.expiresAt)
      )
    )
    .returning({ id: oauthRefreshToken.id })
  const verifications = await db
    .delete(verification)
    .where(lte(verification.expiresAt, now))
    .returning({ id: verification.id })

  return {
    sessions: sessions.sessions,
    refreshTokens: sessions.refreshTokens + refreshTokens.length,
    accessTokens: sessions.accessTokens + accessTokens.length,
    verifications: verifications.length,
  }
}

// Deleted here, Better Auth's session hook never runs, so this does what it
// would: an application's tokens never outlive the session they were issued
// from. They go first, while `session_id` still names it; the delete sets it
// null, and an access token without a session is no longer checked against
// one. In batches, each a transaction that locks its sessions until both are
// gone.
async function deleteExpiredSessions(now: Date) {
  const removed = { sessions: 0, refreshTokens: 0, accessTokens: 0 }

  for (;;) {
    const batch = await db.transaction(async (tx) => {
      const expired = await tx
        .select({ id: session.id })
        .from(session)
        .where(lte(session.expiresAt, now))
        .limit(SESSION_BATCH)
        .for("update")
      const ids = expired.map((row) => row.id)
      if (ids.length === 0) return 0

      const accessTokens = await tx
        .delete(oauthAccessToken)
        .where(inArray(oauthAccessToken.sessionId, ids))
        .returning({ id: oauthAccessToken.id })
      const refreshTokens = await tx
        .delete(oauthRefreshToken)
        .where(inArray(oauthRefreshToken.sessionId, ids))
        .returning({ id: oauthRefreshToken.id })
      const sessions = await tx
        .delete(session)
        .where(and(inArray(session.id, ids), lte(session.expiresAt, now)))
        .returning({ id: session.id })

      removed.refreshTokens += refreshTokens.length
      removed.accessTokens += accessTokens.length
      removed.sessions += sessions.length

      return ids.length
    })

    if (batch < SESSION_BATCH) return removed
  }
}
