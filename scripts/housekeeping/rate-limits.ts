import { lt } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { rateLimit } from "@/features/shared/lib/db/schema"

const STALE_AGE_MS = 24 * 60 * 60 * 1000

export async function housekeepRateLimits() {
  const removed = await db
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, Date.now() - STALE_AGE_MS))
    .returning({ key: rateLimit.key })

  return { deleted: removed.length }
}
