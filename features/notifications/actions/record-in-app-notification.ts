"use server"

import { requireDeliveryAuthority } from "@/features/notifications/lib/delivery-authority"
import type { RecordInAppNotificationInput } from "@/features/notifications/types"
import { db } from "@/features/shared/lib/db/client"
import { notification } from "@/features/shared/lib/db/schema"

export async function recordInAppNotification(
  authority: symbol,
  {
    userId,
    organizationId,
    topic,
    kind,
    payload,
    link,
    createdAt = new Date(),
  }: RecordInAppNotificationInput
): Promise<void> {
  requireDeliveryAuthority(authority)
  await db.insert(notification).values({
    id: crypto.randomUUID(),
    userId,
    organizationId,
    topic,
    kind,
    payload,
    link,
    createdAt,
  })
}
