"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { canAccessOrganization, getAccessContext } from "@/features/auth"
import {
  isKindEmailLocked,
  isNotificationKind,
  isOrganizationKind,
  KIND_DEFAULTS,
  NOTIFICATION_KINDS,
} from "@/features/notifications/lib/topics"
import type {
  NotificationPreferencesOverview,
  OrganizationPreferenceOverrides,
} from "@/features/notifications/types"
import { db } from "@/features/shared/lib/db/client"
import {
  notificationPreference,
  organization,
} from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

export async function getNotificationPreferences(): Promise<
  QueryResult<NotificationPreferencesOverview>
> {
  const t = await getTranslations("common")
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) return { success: false, error: t("errors.notSignedIn") }

  const accessibleOrgIds = access.memberships
    .filter((membership) => canAccessOrganization(membership))
    .map((membership) => membership.organizationId)

  const [rows, orgRows] = await Promise.all([
    db
      .select({
        organizationId: notificationPreference.organizationId,
        kind: notificationPreference.kind,
        email: notificationPreference.email,
        inApp: notificationPreference.inApp,
      })
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, currentUser.id)),
    accessibleOrgIds.length > 0
      ? db
          .select({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            logo: organization.logo,
          })
          .from(organization)
          .where(
            and(
              inArray(organization.id, accessibleOrgIds),
              eq(organization.status, "active")
            )
          )
          .orderBy(desc(organization.isRoot), asc(organization.name))
      : Promise.resolve([]),
  ])

  const activeOrgIds = new Set(orgRows.map((org) => org.id))
  const globalByKind = new Map<
    string,
    { email: boolean | null; inApp: boolean | null }
  >()
  const overrides: Record<string, OrganizationPreferenceOverrides> = {}

  for (const row of rows) {
    if (!isNotificationKind(row.kind)) continue

    if (row.organizationId === null) {
      globalByKind.set(row.kind, { email: row.email, inApp: row.inApp })
      continue
    }

    if (activeOrgIds.has(row.organizationId) && isOrganizationKind(row.kind)) {
      const emailLocked = isKindEmailLocked(row.kind)
      const inAppOverride = row.inApp ?? undefined
      const emailOverride = emailLocked ? undefined : (row.email ?? undefined)

      if (inAppOverride !== undefined || emailOverride !== undefined) {
        const bucket = (overrides[row.organizationId] ??= {})
        bucket[row.kind] = {
          ...(inAppOverride !== undefined && { inApp: inAppOverride }),
          ...(emailOverride !== undefined && { email: emailOverride }),
        }
      }
    }
  }

  return {
    success: true,
    data: {
      global: NOTIFICATION_KINDS.map((kind) => {
        const saved = globalByKind.get(kind)
        const defaults = KIND_DEFAULTS[kind]
        const emailLocked = isKindEmailLocked(kind)
        const effectiveInApp = saved?.inApp ?? defaults.inApp
        const effectiveEmail = emailLocked
          ? true
          : (saved?.email ?? defaults.email)

        return {
          kind,
          inApp: effectiveInApp,
          email: effectiveEmail,
          inAppCustom: effectiveInApp !== defaults.inApp,
          emailCustom: !emailLocked && effectiveEmail !== defaults.email,
          emailLocked,
        }
      }),
      organizations: orgRows,
      overrides,
    },
  }
}
