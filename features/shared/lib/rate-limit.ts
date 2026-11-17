import { eq, sql } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { rateLimit } from "@/features/shared/lib/db/schema"

export type RateLimitRule = { window: number; max: number }

export type RateLimitDecision = {
  allowed: boolean
  retryAfter: number | null
}

/**
 * Counts one request against `key` within a fixed `window` (in seconds)
 * anchored at the window's first request. The upsert makes check and increment
 * a single statement, so concurrent requests cannot all pass a stale read.
 * `lastRequest` records when the active window started and only advances once
 * `window` has elapsed, so steady traffic below `max` per `window` never
 * accumulates into a lockout.
 */
export async function consumeRateLimit(
  key: string,
  { window, max }: RateLimitRule,
  now = Date.now()
): Promise<RateLimitDecision> {
  const windowMs = window * 1000

  const [row] = await db
    .insert(rateLimit)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case
          when ${now} - ${rateLimit.lastRequest} >= ${windowMs} then 1
          else least(${rateLimit.count} + 1, ${max + 1}) end`,
        lastRequest: sql`case
          when ${now} - ${rateLimit.lastRequest} >= ${windowMs} then ${now}
          else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count, lastRequest: rateLimit.lastRequest })

  if (row.count <= max) return { allowed: true, retryAfter: null }

  return {
    allowed: false,
    retryAfter: Math.max(
      1,
      Math.ceil((row.lastRequest + windowMs - now) / 1000)
    ),
  }
}

export async function resetRateLimit(key: string) {
  await db.delete(rateLimit).where(eq(rateLimit.key, key))
}
