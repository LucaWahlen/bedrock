import type {
  NotificationItem,
  NotificationPayload,
} from "@/features/notifications/types"
import type { Translator } from "@/features/shared/lib/i18n/translator"

type NotificationsTranslator = Translator<"notifications">

function deviceText(
  t: NotificationsTranslator,
  payload: NotificationPayload
): string {
  if (payload.browser && payload.os) {
    return t("details.browserOnOs", {
      browser: payload.browser,
      os: payload.os,
    })
  }
  if (payload.browser) return payload.browser
  if (payload.os) return t("details.osDevice", { os: payload.os })
  return t("details.unknownDevice")
}

function roleText(
  t: NotificationsTranslator,
  role: string | undefined
): string {
  if (role === "owner" || role === "admin" || role === "member") {
    return t(`roles.${role}`)
  }
  return role ?? t("roles.member")
}

export function formatInboxItem(
  item: NotificationItem,
  t: NotificationsTranslator,
  formatList: (values: string[]) => string
): { title: string; body?: string } {
  const device = deviceText(t, item.payload)
  const organization =
    item.organization?.name ?? item.payload.organization ?? t("details.unknown")
  const actor = item.payload.actor ?? t("details.unknown")

  switch (item.kind) {
    case "password_changed":
      return {
        title: t("inbox.items.password_changed.title"),
        body: item.payload.otherSessionsRevoked
          ? t("inbox.items.password_changed.bodyRevoked", { device })
          : t("inbox.items.password_changed.body", { device }),
      }
    case "email_change_requested":
      return {
        title: t("inbox.items.email_change_requested.title"),
        body: t("inbox.items.email_change_requested.body", {
          newEmail: item.payload.newEmail ?? t("details.unknown"),
        }),
      }
    case "email_changed":
      return {
        title: t("inbox.items.email_changed.title"),
        body: t("inbox.items.email_changed.body", {
          newEmail: item.payload.newEmail ?? t("details.unknown"),
        }),
      }
    case "two_factor_enabled":
      return {
        title: t("inbox.items.two_factor_enabled.title"),
        body: t("inbox.items.two_factor_enabled.body", { device }),
      }
    case "two_factor_disabled":
      return {
        title: t("inbox.items.two_factor_disabled.title"),
      }
    case "backup_codes_regenerated":
      return {
        title: t("inbox.items.backup_codes_regenerated.title"),
        body: t("inbox.items.backup_codes_regenerated.body"),
      }
    case "passkey_added":
      return {
        title: t("inbox.items.passkey_added.title"),
        body: t("inbox.items.passkey_added.body", {
          passkey: item.payload.passkey ?? t("details.passkey"),
        }),
      }
    case "passkey_removed":
      return {
        title: t("inbox.items.passkey_removed.title"),
        body: t("inbox.items.passkey_removed.body", {
          passkey: item.payload.passkey ?? t("details.passkey"),
        }),
      }
    case "account_enabled":
      return {
        title: t("inbox.items.account_enabled.title"),
        body: t("inbox.items.account_enabled.body"),
      }
    case "new_sign_in":
      return {
        title: t("inbox.items.new_sign_in.title"),
        body: item.payload.organization
          ? t("inbox.items.new_sign_in.bodyWithOrganization", {
              organization: item.payload.organization,
              device,
            })
          : t("inbox.items.new_sign_in.body", { device }),
      }
    case "member_added":
      return {
        title: t("inbox.items.member_added.title", { organization }),
        body: t("inbox.items.member_added.body", {
          actor,
          role: roleText(t, item.payload.role),
        }),
      }
    case "member_role_changed": {
      const fromRoles = item.payload.from ?? []
      return {
        title: t("inbox.items.member_role_changed.title", { organization }),
        body: t("inbox.items.member_role_changed.body", {
          actor,
          from:
            fromRoles.length > 0
              ? formatList(fromRoles.map((role) => roleText(t, role)))
              : t("details.unknown"),
          to: roleText(t, item.payload.to),
        }),
      }
    }
    case "member_removed":
      return {
        title: t("inbox.items.member_removed.title", { organization }),
        body: t("inbox.items.member_removed.body", { actor }),
      }
    case "invitation_accepted":
      return {
        title: t("inbox.items.invitation_accepted.title", {
          invitee: item.payload.invitee ?? t("details.unknown"),
          organization,
        }),
        body: t("inbox.items.invitation_accepted.body", {
          role: roleText(t, item.payload.role),
        }),
      }
    case "member_joined":
      return {
        title: t("inbox.items.member_joined.title", {
          member: item.payload.member ?? t("details.unknown"),
          organization,
        }),
        body: t("inbox.items.member_joined.body", {
          role: roleText(t, item.payload.role),
        }),
      }
    case "member_left":
      return {
        title: t("inbox.items.member_left.title", {
          member: item.payload.member ?? t("details.unknown"),
          organization,
        }),
      }
    case "user_signed_up":
      return {
        title: t("inbox.items.user_signed_up.title", {
          member: item.payload.member ?? t("details.unknown"),
          organization,
        }),
      }
    case "break_glass_started":
      return {
        title: t("inbox.items.break_glass_started.title", { organization }),
        body: t("inbox.items.break_glass_started.body", {
          actor,
          minutes: item.payload.minutes ?? 60,
        }),
      }
  }
}
