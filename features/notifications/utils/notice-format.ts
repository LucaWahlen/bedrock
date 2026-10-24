import { emailFormatter } from "@/features/shared/lib/email/format"
import type { Locale } from "@/features/shared/lib/i18n/config"
import { translatorFor } from "@/features/shared/lib/i18n/translator"

// In the recipient's conventions, but pinned to UTC and saying so: a mail is
// read wherever its recipient happens to be, and a server has no idea where.
export function formatNoticeTime(value: Date, locale: Locale) {
  return translatorFor(locale, "notifications.details")("time", {
    time: emailFormatter(locale).dateTime(value, "dateTime"),
  })
}

const KNOWN_ROLES = ["owner", "admin", "member"] as const

function isKnownRole(role: string): role is (typeof KNOWN_ROLES)[number] {
  return (KNOWN_ROLES as readonly string[]).includes(role)
}

export function rolePhrase(role: string, locale: Locale) {
  return isKnownRole(role)
    ? translatorFor(locale, "notifications.roles")(role)
    : role
}

export function rolesPhrase(roles: string[], locale: Locale) {
  return emailFormatter(locale).list(
    roles.map((role) => rolePhrase(role, locale)),
    { type: "conjunction" }
  )
}
