import type { Locale } from "@/features/shared/lib/i18n/config"
import deAccount from "@/messages/de/account.json"
import deApp from "@/messages/de/app.json"
import deApplications from "@/messages/de/applications.json"
import deAudit from "@/messages/de/audit.json"
import deAuth from "@/messages/de/auth.json"
import deCommon from "@/messages/de/common.json"
import deEmails from "@/messages/de/emails.json"
import deGroups from "@/messages/de/groups.json"
import deHealth from "@/messages/de/health.json"
import deNotifications from "@/messages/de/notifications.json"
import deOrganizations from "@/messages/de/organizations.json"
import deUsage from "@/messages/de/usage.json"
import enAccount from "@/messages/en/account.json"
import enApp from "@/messages/en/app.json"
import enApplications from "@/messages/en/applications.json"
import enAudit from "@/messages/en/audit.json"
import enAuth from "@/messages/en/auth.json"
import enCommon from "@/messages/en/common.json"
import enEmails from "@/messages/en/emails.json"
import enGroups from "@/messages/en/groups.json"
import enHealth from "@/messages/en/health.json"
import enNotifications from "@/messages/en/notifications.json"
import enOrganizations from "@/messages/en/organizations.json"
import enUsage from "@/messages/en/usage.json"

// One file per namespace and language, `messages/<locale>/<namespace>.json`,
// so each feature edits only its own pair. A new namespace is a new pair of
// files plus a line in each object below.
const en = {
  common: enCommon,
  app: enApp,
  auth: enAuth,
  account: enAccount,
  organizations: enOrganizations,
  applications: enApplications,
  groups: enGroups,
  audit: enAudit,
  usage: enUsage,
  health: enHealth,
  notifications: enNotifications,
  emails: enEmails,
}

// English is the source of truth for keys and, through `AppConfig`, for types.
export type Messages = typeof en

const de = {
  common: deCommon,
  app: deApp,
  auth: deAuth,
  account: deAccount,
  organizations: deOrganizations,
  applications: deApplications,
  groups: deGroups,
  audit: deAudit,
  usage: deUsage,
  health: deHealth,
  notifications: deNotifications,
  emails: deEmails,
}

// German is cast rather than checked here: English messages are typed down to
// their exact text for argument checking, which German can never match. That
// both languages hold the same keys is `bun run i18n:check`'s job.
const catalogs: Record<Locale, Messages> = {
  en,
  de: de as unknown as Messages,
}

export function messagesFor(locale: Locale): Messages {
  return catalogs[locale]
}
