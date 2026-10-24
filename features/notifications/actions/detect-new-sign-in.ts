"use server"

import { and, eq, gt, gte, ne } from "drizzle-orm"

import type { SignInRecognition } from "@/features/notifications/types"
import { deviceFamily } from "@/features/notifications/utils/device-family"
import { db } from "@/features/shared/lib/db/client"
import { auditEvent, session, user } from "@/features/shared/lib/db/schema"

const LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

// Enough distinct devices for anyone; the rest only cost a larger read.
const MAX_KNOWN_DEVICES = 100

/**
 * Whether the sign-in that just created `sessionToken` came from a device its
 * account has used before: the same browser and operating system as a
 * successful sign-in in the last 90 days, or as another of its live sessions.
 * Called before this sign-in is itself recorded, so it never recognises itself.
 *
 * The person is whoever the live session belongs to, as at the sign-in gate,
 * so a caller can only ever ask about a session it already holds.
 */
export async function detectNewSignIn(
  sessionToken: string
): Promise<SignInRecognition> {
  const now = new Date()

  const [current] = await db
    .select({
      userId: session.userId,
      userAgent: session.userAgent,
      accountCreatedAt: user.createdAt,
    })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .where(and(eq(session.token, sessionToken), gt(session.expiresAt, now)))
    .limit(1)
  if (!current) return "recognised"

  const since = new Date(now.getTime() - LOOKBACK_MS)
  const successfulSignIn = and(
    eq(auditEvent.actorUserId, current.userId),
    eq(auditEvent.action, "authentication.login"),
    eq(auditEvent.outcome, "success")
  )

  const [recentSignIns, otherSessions, [anySignIn]] = await Promise.all([
    db
      .selectDistinct({ userAgent: auditEvent.userAgent })
      .from(auditEvent)
      .where(and(successfulSignIn, gte(auditEvent.createdAt, since)))
      .limit(MAX_KNOWN_DEVICES),
    db
      .select({ userAgent: session.userAgent })
      .from(session)
      .where(
        and(
          eq(session.userId, current.userId),
          ne(session.token, sessionToken),
          gt(session.expiresAt, now)
        )
      )
      .limit(MAX_KNOWN_DEVICES),
    db
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(successfulSignIn)
      .limit(1),
  ])

  const family = deviceFamily(current.userAgent)
  const known =
    family !== null &&
    [...recentSignIns, ...otherSessions].some(
      (seen) => deviceFamily(seen.userAgent) === family
    )
  if (known) return "recognised"

  // Right after an account is created or an invitation accepted there is no
  // history to differ from. An older account without one is a long-unused
  // account being signed in to, which is exactly what this is for.
  const isNewAccount = current.accountCreatedAt.getTime() >= since.getTime()

  return !anySignIn && isNewAccount ? "first" : "new"
}
