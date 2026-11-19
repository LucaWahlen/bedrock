export const ACCOUNT_NOTIFICATION_TOPICS = ["security", "sign_in"] as const

export type AccountNotificationTopic =
  (typeof ACCOUNT_NOTIFICATION_TOPICS)[number]

export const ORGANIZATION_NOTIFICATION_TOPICS = [
  "membership",
  "invitations",
  "member_activity",
  "break_glass",
] as const

export type OrganizationNotificationTopic =
  (typeof ORGANIZATION_NOTIFICATION_TOPICS)[number]

export const NOTIFICATION_TOPICS = [
  ...ACCOUNT_NOTIFICATION_TOPICS,
  ...ORGANIZATION_NOTIFICATION_TOPICS,
] as const

export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number]

export const NOTIFICATION_CHANNELS = ["inApp", "email"] as const

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export const ACCOUNT_NOTIFICATION_KINDS = [
  "new_sign_in",
  "password_changed",
  "email_change_requested",
  "email_changed",
  "two_factor_enabled",
  "two_factor_disabled",
  "backup_codes_regenerated",
  "passkey_added",
  "passkey_removed",
  "account_enabled",
] as const

export type AccountNotificationKind =
  (typeof ACCOUNT_NOTIFICATION_KINDS)[number]

export const ORGANIZATION_NOTIFICATION_KINDS = [
  "member_added",
  "member_role_changed",
  "member_removed",
  "invitation_accepted",
  "member_joined",
  "member_left",
  "user_signed_up",
  "break_glass_started",
] as const

export type OrganizationNotificationKind =
  (typeof ORGANIZATION_NOTIFICATION_KINDS)[number]

export const NOTIFICATION_KINDS = [
  ...ACCOUNT_NOTIFICATION_KINDS,
  ...ORGANIZATION_NOTIFICATION_KINDS,
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const MANDATORY_EMAIL_KINDS = [
  "password_changed",
  "email_change_requested",
  "email_changed",
  "two_factor_enabled",
  "two_factor_disabled",
  "backup_codes_regenerated",
  "passkey_added",
  "passkey_removed",
  "account_enabled",
  "break_glass_started",
] as const

export type MandatoryEmailKind = (typeof MANDATORY_EMAIL_KINDS)[number]

export const KIND_DEFAULTS: Record<
  NotificationKind,
  { inApp: boolean; email: boolean }
> = {
  new_sign_in: { inApp: true, email: true },
  password_changed: { inApp: true, email: true },
  email_change_requested: { inApp: true, email: true },
  email_changed: { inApp: true, email: true },
  two_factor_enabled: { inApp: true, email: true },
  two_factor_disabled: { inApp: true, email: true },
  backup_codes_regenerated: { inApp: true, email: true },
  passkey_added: { inApp: true, email: true },
  passkey_removed: { inApp: true, email: true },
  account_enabled: { inApp: true, email: true },
  member_added: { inApp: true, email: true },
  member_role_changed: { inApp: true, email: true },
  member_removed: { inApp: true, email: true },
  invitation_accepted: { inApp: true, email: true },
  member_joined: { inApp: true, email: false },
  member_left: { inApp: true, email: false },
  user_signed_up: { inApp: true, email: false },
  break_glass_started: { inApp: true, email: true },
}

export const ACCOUNT_PREFERENCE_CATEGORIES = [
  {
    key: "credentials",
    scope: "account",
    kinds: [
      "new_sign_in",
      "password_changed",
      "email_change_requested",
      "email_changed",
    ],
  },
  {
    key: "factors",
    scope: "account",
    kinds: [
      "two_factor_enabled",
      "two_factor_disabled",
      "backup_codes_regenerated",
      "passkey_added",
      "passkey_removed",
      "account_enabled",
    ],
  },
] as const satisfies readonly {
  key: string
  scope: "account"
  kinds: readonly AccountNotificationKind[]
}[]

export const ORGANIZATION_PREFERENCE_CATEGORIES = [
  {
    key: "membership",
    scope: "organization",
    kinds: ["member_added", "member_role_changed", "member_removed"],
  },
  {
    key: "activity",
    scope: "organization",
    kinds: ["invitation_accepted", "member_joined", "member_left"],
  },
  {
    key: "administration",
    scope: "organization",
    kinds: ["user_signed_up", "break_glass_started"],
  },
] as const satisfies readonly {
  key: string
  scope: "organization"
  kinds: readonly OrganizationNotificationKind[]
}[]

export type NotificationCategoryKey =
  | (typeof ACCOUNT_PREFERENCE_CATEGORIES)[number]["key"]
  | (typeof ORGANIZATION_PREFERENCE_CATEGORIES)[number]["key"]

export function isKindEmailLocked(
  kind: NotificationKind
): kind is MandatoryEmailKind {
  return (MANDATORY_EMAIL_KINDS as readonly string[]).includes(kind)
}

export function isOrganizationKind(
  kind: NotificationKind
): kind is OrganizationNotificationKind {
  return (ORGANIZATION_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

export function isNotificationTopic(
  value: unknown
): value is NotificationTopic {
  return (
    typeof value === "string" &&
    (NOTIFICATION_TOPICS as readonly string[]).includes(value)
  )
}

export function isNotificationKind(value: unknown): value is NotificationKind {
  return (
    typeof value === "string" &&
    (NOTIFICATION_KINDS as readonly string[]).includes(value)
  )
}
