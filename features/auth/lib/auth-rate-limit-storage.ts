import { eq } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { rateLimit } from "@/features/shared/lib/db/schema"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"

// Points Better Auth's own limiter at our table instead of its per-process
// memory store, which resets on deploy and gives every replica its own budget.
export const authRateLimitStorage = {
  get: async (key: string) => {
    const [row] = await db
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, key))
      .limit(1)

    return row ?? null
  },
  set: async (key: string, value: { count: number; lastRequest: number }) => {
    await db
      .insert(rateLimit)
      .values({ key, count: value.count, lastRequest: value.lastRequest })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: { count: value.count, lastRequest: value.lastRequest },
      })
  },
  consume: consumeRateLimit,
}
