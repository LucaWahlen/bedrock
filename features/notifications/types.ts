import type { z } from "zod"

import type {
  AccountNotificationKind,
  AccountNotificationTopic,
  NotificationCategoryKey,
  NotificationChannel,
  NotificationKind,
  NotificationTopic,
  OrganizationNotificationKind,
  OrganizationNotificationTopic,
} from "@/features/notifications/lib/topics"
import type { createUpdateNotificationPreferenceSchema } from "@/features/notifications/schemas/preferences"

export type {
  AccountNotificationKind,
  AccountNotificationTopic,
  NotificationCategoryKey,
  NotificationChannel,
  NotificationKind,
  NotificationTopic,
  OrganizationNotificationKind,
  OrganizationNotificationTopic,
}

export type NoticeRecipient = {
  id?: string
  name: string
  email: string
  // Their `user.locale` when the caller already has it; otherwise it is read
  // from the account at this address before the notice is written.
  locale?: string | null
}

// Where a change came from, read from the request before the response is sent,
// because the mail itself goes out after it.
export type NoticeRequest = {
  at: Date
  ipAddress: string | null
  userAgent: string | null
}

export type NoticeOrganization = {
  id?: string
  name: string
  slug: string
  logo: string | null
  color: string | null
}

// "first" is a person's first sign-in at all, which has nothing to compare
// against and so is not news to them.
export type SignInRecognition = "recognised" | "first" | "new"

export type AccountNoticeInput = {
  recipient: NoticeRecipient
  request: NoticeRequest
  // An organization the recipient belongs to, whose settings dialog the mail
  // links to. Null when there is none to send them to.
  organizationSlug: string | null
}

export type MembershipNoticeInput = {
  recipient: NoticeRecipient
  organization: NoticeOrganization
  actorName: string
  at?: Date
}

export type AccountStatusNoticeInput = {
  recipient: NoticeRecipient
  at?: Date
  // An organization they can sign in to again once enabled.
  organizationSlug?: string | null
  // An administrator's own words, shown as written.
  reason?: string | null
}

export type NotificationLink =
  | {
      type: "account"
      section: "security" | "sessions" | "password" | "email"
    }
  | {
      type: "organization"
      slug: string
      path?: "" | "/members" | "/audit-log" | "/directory"
    }

// Locale-neutral facts stored on the notification row so the inbox renders in
// whichever language the reader uses now. Never tokens, codes or secrets.
export type NotificationPayload = {
  browser?: string | null
  os?: string | null
  otherSessionsRevoked?: boolean
  newEmail?: string
  passkey?: string
  organization?: string
  actor?: string
  invitee?: string
  member?: string
  role?: string
  from?: string[]
  to?: string
  minutes?: number
}

export type NotificationOrganizationSummary = {
  id: string
  name: string
  logo: string | null
}

export type NotificationItem = {
  id: string
  topic: NotificationTopic
  kind: NotificationKind
  payload: NotificationPayload
  link: NotificationLink | null
  organization: NotificationOrganizationSummary | null
  readAt: string | null
  createdAt: string
}

export type NotificationCursor = {
  createdAt: string
  id: string
  viewerId: string
}

export type NotificationFeedQuery = {
  filter?: "all" | "unread"
  cursor?: NotificationCursor
}

export type NotificationFeed = {
  notifications: NotificationItem[]
  unreadCount: number
  nextCursor: NotificationCursor | null
}

export type NotificationPreferenceItem = {
  kind: NotificationKind
  inApp: boolean
  email: boolean
  inAppCustom: boolean
  emailCustom: boolean
  emailLocked: boolean
}

export type NotificationPreferenceOrganization = {
  id: string
  name: string
  slug: string
  logo: string | null
}

export type OrganizationChannelOverride = {
  inApp?: boolean
  email?: boolean
}

export type OrganizationPreferenceOverrides = Partial<
  Record<OrganizationNotificationKind, OrganizationChannelOverride>
>

export type NotificationPreferencesOverview = {
  global: NotificationPreferenceItem[]
  organizations: NotificationPreferenceOrganization[]
  overrides: Record<string, OrganizationPreferenceOverrides>
}

export type UpdateNotificationPreferenceInput = z.infer<
  ReturnType<typeof createUpdateNotificationPreferenceSchema>
>

export type UpdateNotificationPreferenceResult =
  | { success: true }
  | { success: false; error: string; needsConfirmation?: true }

export type NoticeDeliveryResolution = {
  userId: string | null
  organizationId: string | null
  locale: string | null
  sendEmail: boolean
  sendInApp: boolean
}

export type RecordInAppNotificationInput = {
  userId: string
  organizationId: string | null
  topic: NotificationTopic
  kind: NotificationKind
  payload: NotificationPayload
  link: NotificationLink | null
  createdAt?: Date
}
