"use server"

import { and, count, desc, eq, isNull, sql } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { z } from "zod"

import {
  canAccessOrganization,
  getAccessContext,
  membershipIn,
} from "@/features/auth"
import {
  isNotificationKind,
  isNotificationTopic,
} from "@/features/notifications/lib/topics"
import { visibleNotifications } from "@/features/notifications/lib/visible-notifications"
import type {
  NotificationFeed,
  NotificationFeedQuery,
  NotificationItem,
  NotificationLink,
  NotificationPayload,
} from "@/features/notifications/types"
import { db } from "@/features/shared/lib/db/client"
import { notification, organization } from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

const INBOX_LIMIT = 50
const feedQuery = z.object({
  filter: z.enum(["all", "unread"]).default("all"),
  cursor: z
    .object({
      createdAt: z.iso.datetime(),
      id: z.string().min(1),
      viewerId: z.string().min(1),
    })
    .optional(),
})

const ACCOUNT_LINK_SECTIONS = [
  "security",
  "sessions",
  "password",
  "email",
] as const

const ORGANIZATION_LINK_PATHS = [
  "",
  "/members",
  "/audit-log",
  "/directory",
] as const

function parseLink(
  raw: Record<string, unknown> | null
): NotificationLink | null {
  if (!raw || typeof raw !== "object") return null

  if (
    raw.type === "account" &&
    typeof raw.section === "string" &&
    (ACCOUNT_LINK_SECTIONS as readonly string[]).includes(raw.section)
  ) {
    return {
      type: "account",
      section: raw.section as (typeof ACCOUNT_LINK_SECTIONS)[number],
    }
  }

  if (raw.type === "organization" && typeof raw.slug === "string") {
    const path =
      typeof raw.path === "string" &&
      (ORGANIZATION_LINK_PATHS as readonly string[]).includes(raw.path)
        ? (raw.path as (typeof ORGANIZATION_LINK_PATHS)[number])
        : ""
    return { type: "organization", slug: raw.slug, path }
  }

  return null
}

function parsePayload(raw: Record<string, unknown>): NotificationPayload {
  return {
    ...(typeof raw.browser === "string" && { browser: raw.browser }),
    ...(typeof raw.os === "string" && { os: raw.os }),
    ...(typeof raw.otherSessionsRevoked === "boolean" && {
      otherSessionsRevoked: raw.otherSessionsRevoked,
    }),
    ...(typeof raw.newEmail === "string" && { newEmail: raw.newEmail }),
    ...(typeof raw.passkey === "string" && { passkey: raw.passkey }),
    ...(typeof raw.organization === "string" && {
      organization: raw.organization,
    }),
    ...(typeof raw.actor === "string" && { actor: raw.actor }),
    ...(typeof raw.invitee === "string" && { invitee: raw.invitee }),
    ...(typeof raw.member === "string" && { member: raw.member }),
    ...(typeof raw.role === "string" && { role: raw.role }),
    ...(Array.isArray(raw.from) && {
      from: raw.from.filter((item): item is string => typeof item === "string"),
    }),
    ...(typeof raw.to === "string" && { to: raw.to }),
    ...(typeof raw.minutes === "number" && { minutes: raw.minutes }),
  }
}

export async function listNotifications(
  input: NotificationFeedQuery = {}
): Promise<QueryResult<NotificationFeed>> {
  const t = await getTranslations("common")
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) return { success: false, error: t("errors.notSignedIn") }
  const parsed = feedQuery.safeParse(input)
  if (!parsed.success) return { success: false, error: t("errors.unexpected") }
  const { filter, cursor } = parsed.data
  if (cursor && cursor.viewerId !== currentUser.id)
    return { success: false, error: t("errors.unexpected") }

  const visible = visibleNotifications(currentUser.id)

  const [rows, [counts]] = await Promise.all([
    db
      .select({
        id: notification.id,
        organizationId: notification.organizationId,
        topic: notification.topic,
        kind: notification.kind,
        payload: notification.payload,
        link: notification.link,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
        // Keep all six PostgreSQL fractional digits; JS dates lose the last three.
        cursorTime: sql<string>`to_char(${notification.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        organizationLogo: organization.logo,
      })
      .from(notification)
      .leftJoin(organization, eq(organization.id, notification.organizationId))
      .where(
        and(
          visible,
          filter === "unread" ? isNull(notification.readAt) : undefined,
          cursor
            ? sql`(${notification.createdAt}, ${notification.id}) < (${cursor.createdAt}::timestamp, ${cursor.id})`
            : undefined
        )
      )
      .orderBy(desc(notification.createdAt), desc(notification.id))
      .limit(INBOX_LIMIT + 1),
    db
      .select({ total: count(), read: count(notification.readAt) })
      .from(notification)
      .leftJoin(organization, eq(organization.id, notification.organizationId))
      .where(visible),
  ])

  const notifications: NotificationItem[] = []
  for (const row of rows.slice(0, INBOX_LIMIT)) {
    if (!isNotificationTopic(row.topic) || !isNotificationKind(row.kind)) {
      continue
    }

    const parsedLink = parseLink(row.link)
    let link = parsedLink
    if (parsedLink?.type === "organization") {
      const membership = row.organizationId
        ? membershipIn(access, row.organizationId)
        : null
      if (!membership || !canAccessOrganization(membership)) {
        link = null
      } else if (row.organizationSlug) {
        link = {
          type: "organization",
          slug: row.organizationSlug,
          path: parsedLink.path,
        }
      }
    }

    const payload = parsePayload(row.payload)
    if (row.organizationName && payload.organization !== undefined) {
      payload.organization = row.organizationName
    }

    notifications.push({
      id: row.id,
      topic: row.topic,
      kind: row.kind,
      payload,
      link,
      organization:
        row.organizationId && row.organizationName
          ? {
              id: row.organizationId,
              name: row.organizationName,
              logo: row.organizationLogo ?? null,
            }
          : null,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })
  }

  const boundary = rows.length > INBOX_LIMIT ? rows[INBOX_LIMIT - 1] : undefined
  return {
    success: true,
    data: {
      notifications,
      unreadCount: (counts?.total ?? 0) - (counts?.read ?? 0),
      nextCursor: boundary
        ? {
            createdAt: boundary.cursorTime,
            id: boundary.id,
            viewerId: currentUser.id,
          }
        : null,
    },
  }
}
