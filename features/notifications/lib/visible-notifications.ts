import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm"

import {
  NOTIFICATION_KINDS,
  NOTIFICATION_TOPICS,
} from "@/features/notifications/lib/topics"
import { notification, organization } from "@/features/shared/lib/db/schema"

// Applied after a left join so personal notices remain visible, but notices
// tied to a missing or deleted organization do not.
export function visibleNotifications(userId: string) {
  return and(
    eq(notification.userId, userId),
    inArray(notification.topic, NOTIFICATION_TOPICS),
    inArray(notification.kind, NOTIFICATION_KINDS),
    or(
      isNull(notification.organizationId),
      and(isNotNull(organization.id), ne(organization.status, "deleted"))
    )
  )
}
