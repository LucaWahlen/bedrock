import { lt } from "drizzle-orm"

import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { auditEvent } from "@/features/shared/lib/db/schema"

export async function housekeepAuditEvents() {
  const retentionDays = env.housekeeping.auditRetentionDays
  if (!retentionDays) return { skipped: true as const, deleted: 0 }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const removed = await db
    .delete(auditEvent)
    .where(lt(auditEvent.createdAt, cutoff))
    .returning({ id: auditEvent.id })

  return { deleted: removed.length }
}
