"use server"

import { and, eq, inArray, isNull } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { getAccessContext } from "@/features/auth"
import { visibleNotifications } from "@/features/notifications/lib/visible-notifications"
import { db } from "@/features/shared/lib/db/client"
import { notification, organization } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { user } = await getAccessContext()
  if (!user) {
    const t = await getTranslations("common")
    return { success: false, error: t("errors.notSignedIn") }
  }

  const visibleIds = db
    .select({ id: notification.id })
    .from(notification)
    .leftJoin(organization, eq(organization.id, notification.organizationId))
    .where(visibleNotifications(user.id))

  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(isNull(notification.readAt), inArray(notification.id, visibleIds))
    )

  revalidateEverywhere()
  return { success: true }
}
