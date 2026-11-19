"use server"

import { and, eq, isNull, or, sql } from "drizzle-orm"

import { requireDeliveryAuthority } from "@/features/notifications/lib/delivery-authority"
import {
  isKindEmailLocked,
  KIND_DEFAULTS,
} from "@/features/notifications/lib/topics"
import type {
  NoticeDeliveryResolution,
  NotificationKind,
} from "@/features/notifications/types"
import { db } from "@/features/shared/lib/db/client"
import {
  notificationPreference,
  organization,
  user,
} from "@/features/shared/lib/db/schema"

/**
 * Resolves the recipient account, its chosen language, and which channels
 * should carry a notice. Email-only notices with no interactive `preferenceKind`
 * (such as account disabled/deleted) always send mail. For interactive kinds,
 * each channel resolves independently:
 * organization override -> global override -> `KIND_DEFAULTS[kind]`,
 * with locked security kinds always forcing `sendEmail = true`.
 */
export async function resolveNoticeDelivery(
  authority: symbol,
  {
    userId,
    accountEmail,
    preferenceKind,
    organizationId,
    organizationSlug,
  }: {
    userId?: string
    accountEmail: string
    preferenceKind?: NotificationKind
    organizationId?: string
    organizationSlug?: string
  }
): Promise<NoticeDeliveryResolution> {
  requireDeliveryAuthority(authority)
  const normalizedEmail = accountEmail.trim().toLowerCase()
  const [[account], [orgRow]] = await Promise.all([
    db
      .select({
        id: user.id,
        locale: user.locale,
      })
      .from(user)
      .where(
        userId
          ? eq(user.id, userId)
          : eq(sql`lower(${user.email})`, normalizedEmail)
      )
      .limit(1),
    organizationId
      ? Promise.resolve([{ id: organizationId }])
      : organizationSlug
        ? db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.slug, organizationSlug))
            .limit(1)
        : Promise.resolve([]),
  ])

  const resolvedOrgId = orgRow?.id ?? null
  if (!preferenceKind) {
    return {
      userId: account?.id ?? null,
      organizationId: resolvedOrgId,
      locale: account?.locale ?? null,
      sendEmail: true,
      sendInApp: false,
    }
  }

  const defaults = KIND_DEFAULTS[preferenceKind]
  const emailLocked = isKindEmailLocked(preferenceKind)

  if (!account) {
    return {
      userId: null,
      organizationId: resolvedOrgId,
      locale: null,
      sendEmail: emailLocked ? true : defaults.email,
      sendInApp: false,
    }
  }

  const prefRows = await db
    .select({
      organizationId: notificationPreference.organizationId,
      email: notificationPreference.email,
      inApp: notificationPreference.inApp,
    })
    .from(notificationPreference)
    .where(
      and(
        eq(notificationPreference.userId, account.id),
        eq(notificationPreference.kind, preferenceKind),
        resolvedOrgId
          ? or(
              isNull(notificationPreference.organizationId),
              eq(notificationPreference.organizationId, resolvedOrgId)
            )
          : isNull(notificationPreference.organizationId)
      )
    )

  const globalPref = prefRows.find((row) => row.organizationId === null)
  const orgPref = resolvedOrgId
    ? prefRows.find((row) => row.organizationId === resolvedOrgId)
    : undefined

  return {
    userId: account.id,
    organizationId: resolvedOrgId,
    locale: account.locale ?? null,
    sendEmail: emailLocked
      ? true
      : (orgPref?.email ?? globalPref?.email ?? defaults.email),
    sendInApp: orgPref?.inApp ?? globalPref?.inApp ?? defaults.inApp,
  }
}
