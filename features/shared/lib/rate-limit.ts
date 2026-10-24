import { eq, sql } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { rateLimit } from "@/features/shared/lib/db/schema"

export type RateLimitRule = { window: number; max: number }

export type RateLimitDecision = {
  allowed: boolean
  retryAfter: number | null
}

/**
 * Counts one request against `key` and reports whether it is allowed. The
 * upsert makes check and increment a single statement, so concurrent requests
 * cannot all pass a stale read. Once the count exceeds `max`, `lastRequest`
 * freezes, so the lockout ends `window` after the request that tripped it
 * rather than after the latest attempt. Below the limit, `lastRequest` still
 * tracks the most recent request, so the window slides with activity.
 */
export async function consumeRateLimit(
  key: string,
  { window, max }: RateLimitRule
): Promise<RateLimitDecision> {
  const now = Date.now()
  const windowMs = window * 1000

  const [row] = await db
    .insert(rateLimit)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${now} - ${rateLimit.lastRequest} > ${windowMs} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case
          when ${now} - ${rateLimit.lastRequest} > ${windowMs} then ${now}
          when ${rateLimit.count} + 1 > ${max} then ${rateLimit.lastRequest}
          else ${now} end`,
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
