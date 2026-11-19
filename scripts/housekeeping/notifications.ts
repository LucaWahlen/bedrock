import { lt } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { notification } from "@/features/shared/lib/db/schema"

const NOTIFICATION_RETENTION_DAYS = 90

/**
 * Prunes in-app notifications past the retention window so the inbox stays
 * bounded. Security history itself lives in the audit log.
 */
export async function housekeepNotifications() {
  const cutoff = new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  )
  const removed = await db
    .delete(notification)
    .where(lt(notification.createdAt, cutoff))
    .returning({ id: notification.id })

  return { deleted: removed.length }
}
