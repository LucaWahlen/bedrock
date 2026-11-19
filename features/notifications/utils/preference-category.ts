import { isOrganizationKind } from "@/features/notifications/lib/topics"
import type {
  NotificationKind,
  NotificationPreferencesOverview,
} from "@/features/notifications/types"

export function preferenceCategory(
  kinds: readonly NotificationKind[],
  overview: NotificationPreferencesOverview,
  organizationId: string | null
) {
  const overrides = organizationId
    ? overview.overrides[organizationId]
    : undefined
  return overview.global
    .filter((item) => kinds.includes(item.kind))
    .map((item) => {
      const override = isOrganizationKind(item.kind)
        ? overrides?.[item.kind]
        : undefined
      return {
        kind: item.kind,
        emailLocked: item.emailLocked,
        inApp: override?.inApp ?? item.inApp,
        email: item.emailLocked || (override?.email ?? item.email),
        inAppCustom: override?.inApp !== undefined,
        emailCustom: !item.emailLocked && override?.email !== undefined,
      }
    })
}
