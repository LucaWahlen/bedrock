import { describeUserAgent } from "@/features/account"
import {
  NoticeEmail,
  type NoticeAction,
  type NoticeDetail,
} from "@/features/notifications/components/notice-email"
import {
  accountSectionUrl,
  organizationUrl,
  sendNotice,
  type InAppNoticeSpec,
} from "@/features/notifications/lib/send-notice"
import type {
  AccountNoticeInput,
  AccountStatusNoticeInput,
  NoticeRecipient,
  NoticeRequest,
  NotificationTopic,
} from "@/features/notifications/types"
import { maskEmail } from "@/features/notifications/utils/mask-email"
import { formatNoticeTime } from "@/features/notifications/utils/notice-format"
import { getRootOrganization } from "@/features/organizations"
import { env } from "@/features/shared/lib/config/env"
import { emailBrand } from "@/features/shared/lib/email/render"
import type { Locale } from "@/features/shared/lib/i18n/config"
import {
  translatorFor,
  type Translator,
} from "@/features/shared/lib/i18n/translator"

type NoticeTranslator = Translator<"notifications">

// An account belongs to the instance rather than to any one organization, so
// its notices carry the instance's own branding.
async function accountBrand() {
  const root = await getRootOrganization()

  return emailBrand(root ?? { name: env.rootOrganization.name })
}

function deviceLabel(t: NoticeTranslator, userAgent: string | null) {
  const { browser, os } = describeUserAgent(userAgent)

  if (browser && os) return t("details.browserOnOs", { browser, os })
  if (browser) return browser
  if (os) return t("details.osDevice", { os })
  return t("details.unknownDevice")
}

function requestDetails(
  t: NoticeTranslator,
  locale: Locale,
  request: NoticeRequest
): NoticeDetail[] {
  return [
    { label: t("details.when"), value: formatNoticeTime(request.at, locale) },
    { label: t("details.device"), value: deviceLabel(t, request.userAgent) },
    {
      label: t("details.ipAddress"),
      value: request.ipAddress ?? t("details.unknown"),
    },
  ]
}

type ComposeContext = {
  t: NoticeTranslator
  locale: Locale
  // The instance's name, which the account belongs to.
  organization: string
  name: string
}

type AccountNotice = {
  subject: string
  paragraphs: string[]
  details: NoticeDetail[]
  guidance: string
  action?: NoticeAction
}

function deviceFacts(userAgent: string | null) {
  const { browser, os } = describeUserAgent(userAgent)

  return {
    ...(browser ? { browser } : {}),
    ...(os ? { os } : {}),
  }
}

function sendAccountNotice({
  kind,
  topic = "security",
  recipient,
  compose,
  inApp,
  accountEmail,
}: {
  kind: string
  topic?: NotificationTopic
  recipient: NoticeRecipient
  compose: (context: ComposeContext) => AccountNotice
  inApp?: InAppNoticeSpec
  accountEmail?: string
}) {
  return sendNotice({
    kind,
    topic,
    recipient,
    inApp,
    accountEmail,
    compose: async (locale) => {
      const brand = await accountBrand()
      const notice = compose({
        t: translatorFor(locale, "notifications"),
        locale,
        organization: brand.organizationName,
        name: recipient.name,
      })

      return {
        subject: notice.subject,
        element: NoticeEmail({
          brand,
          locale,
          preview: notice.subject,
          heading: notice.subject,
          paragraphs: notice.paragraphs,
          details: notice.details,
          guidance: notice.guidance,
          action: notice.action,
        }),
      }
    },
  })
}

function securityAction(
  t: NoticeTranslator,
  slug: string | null,
  section: "security" | "sessions" | "password" = "security"
): NoticeAction | undefined {
  return slug
    ? {
        label: t("actions.reviewSecurity"),
        url: accountSectionUrl(slug, section),
      }
    : undefined
}

// What someone who did not do this should do next, written for a person who
// may no longer be able to sign in: without an organization to open, the steps
// that need one are left out.
function notYou(t: NoticeTranslator, slug: string | null, guidance: string) {
  return slug ? guidance : t("notYouWithoutAccess")
}

export function sendPasswordChangedNotice({
  recipient,
  request,
  organizationSlug,
  otherSessionsRevoked,
}: AccountNoticeInput & { otherSessionsRevoked: boolean }) {
  return sendAccountNotice({
    kind: "password-changed",
    recipient,
    inApp: {
      kind: "password_changed",
      payload: {
        ...deviceFacts(request.userAgent),
        otherSessionsRevoked,
      },
      link: { type: "account", section: "security" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("passwordChanged.subject"),
      paragraphs: [
        t("passwordChanged.body", { name, organization }),
        ...(otherSessionsRevoked
          ? [t("passwordChanged.otherSessionsRevoked")]
          : []),
      ],
      details: requestDetails(t, locale, request),
      guidance: notYou(t, organizationSlug, t("passwordChanged.guidance")),
      action: securityAction(t, organizationSlug),
    }),
  })
}

export function sendEmailChangeRequestedNotice({
  recipient,
  request,
  organizationSlug,
  newEmail,
}: AccountNoticeInput & { newEmail: string }) {
  const masked = maskEmail(newEmail)

  return sendAccountNotice({
    kind: "email-change-requested",
    recipient,
    inApp: {
      kind: "email_change_requested",
      payload: { newEmail: masked },
      link: { type: "account", section: "email" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("emailChangeRequested.subject"),
      paragraphs: [
        t("emailChangeRequested.body", { name, organization }),
        t("emailChangeRequested.pending"),
      ],
      details: [
        { label: t("details.newAddress"), value: masked },
        ...requestDetails(t, locale, request),
      ],
      guidance: notYou(t, organizationSlug, t("emailChangeRequested.guidance")),
      action: securityAction(t, organizationSlug, "password"),
    }),
  })
}

// Sent to the address the account just left, so its language is read from the
// account at the address it moved to.
export function sendEmailChangedNotice({
  recipient,
  request,
  organizationSlug,
  newEmail,
}: AccountNoticeInput & { newEmail: string }) {
  const masked = maskEmail(newEmail)

  return sendAccountNotice({
    kind: "email-changed",
    recipient,
    accountEmail: newEmail,
    inApp: {
      kind: "email_changed",
      payload: { newEmail: masked },
      link: { type: "account", section: "security" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("emailChanged.subject"),
      paragraphs: [t("emailChanged.body", { name, organization })],
      details: [
        { label: t("details.newAddress"), value: masked },
        ...requestDetails(t, locale, request),
      ],
      guidance: t("emailChanged.guidance"),
      action: securityAction(t, organizationSlug),
    }),
  })
}

export function sendTwoFactorEnabledNotice({
  recipient,
  request,
  organizationSlug,
}: AccountNoticeInput) {
  return sendAccountNotice({
    kind: "two-factor-enabled",
    recipient,
    inApp: {
      kind: "two_factor_enabled",
      payload: deviceFacts(request.userAgent),
      link: { type: "account", section: "security" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("twoFactorEnabled.subject"),
      paragraphs: [t("twoFactorEnabled.body", { name, organization })],
      details: requestDetails(t, locale, request),
      guidance: notYou(t, organizationSlug, t("twoFactorEnabled.guidance")),
      action: securityAction(t, organizationSlug),
    }),
  })
}

export function sendTwoFactorDisabledNotice({
  recipient,
  request,
  organizationSlug,
}: AccountNoticeInput) {
  return sendAccountNotice({
    kind: "two-factor-disabled",
    recipient,
    inApp: {
      kind: "two_factor_disabled",
      payload: deviceFacts(request.userAgent),
      link: { type: "account", section: "security" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("twoFactorDisabled.subject"),
      paragraphs: [t("twoFactorDisabled.body", { name, organization })],
      details: requestDetails(t, locale, request),
      guidance: notYou(t, organizationSlug, t("twoFactorDisabled.guidance")),
      action: securityAction(t, organizationSlug),
    }),
  })
}

export function sendBackupCodesRegeneratedNotice({
  recipient,
  request,
  organizationSlug,
}: AccountNoticeInput) {
  return sendAccountNotice({
    kind: "backup-codes-regenerated",
    recipient,
    inApp: {
      kind: "backup_codes_regenerated",
      payload: deviceFacts(request.userAgent),
      link: { type: "account", section: "security" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("backupCodesRegenerated.subject"),
      paragraphs: [t("backupCodesRegenerated.body", { name, organization })],
      details: requestDetails(t, locale, request),
      guidance: notYou(
        t,
        organizationSlug,
        t("backupCodesRegenerated.guidance")
      ),
      action: securityAction(t, organizationSlug),
    }),
  })
}

export function sendPasskeyAddedNotice({
  recipient,
  request,
  organizationSlug,
  passkeyName,
}: AccountNoticeInput & { passkeyName: string }) {
  return sendAccountNotice({
    kind: "passkey-added",
    recipient,
    inApp: {
      kind: "passkey_added",
      payload: { passkey: passkeyName },
      link: { type: "account", section: "security" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("passkeyAdded.subject"),
      paragraphs: [t("passkeyAdded.body", { name, organization })],
      details: [
        { label: t("details.passkey"), value: passkeyName },
        ...requestDetails(t, locale, request),
      ],
      guidance: notYou(t, organizationSlug, t("passkeyAdded.guidance")),
      action: securityAction(t, organizationSlug),
    }),
  })
}

export function sendPasskeyRemovedNotice({
  recipient,
  request,
  organizationSlug,
  passkeyName,
}: AccountNoticeInput & { passkeyName: string }) {
  return sendAccountNotice({
    kind: "passkey-removed",
    recipient,
    inApp: {
      kind: "passkey_removed",
      payload: { passkey: passkeyName },
      link: { type: "account", section: "security" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("passkeyRemoved.subject"),
      paragraphs: [t("passkeyRemoved.body", { name, organization })],
      details: [
        { label: t("details.passkey"), value: passkeyName },
        ...requestDetails(t, locale, request),
      ],
      guidance: notYou(t, organizationSlug, t("passkeyRemoved.guidance")),
      action: securityAction(t, organizationSlug),
    }),
  })
}

export function sendAccountDeletedNotice({
  recipient,
  request,
}: Omit<AccountNoticeInput, "organizationSlug">) {
  return sendAccountNotice({
    kind: "account-deleted",
    recipient,
    compose: ({ t, locale, organization, name }) => ({
      subject: t("accountDeleted.subject"),
      paragraphs: [t("accountDeleted.body", { name, organization })],
      details: requestDetails(t, locale, request),
      guidance: t("notYouWithoutAccess"),
    }),
  })
}

export function sendNewSignInNotice({
  recipient,
  request,
  organizationSlug,
  organizationName,
}: AccountNoticeInput & { organizationName?: string | null }) {
  return sendAccountNotice({
    kind: "new-sign-in",
    topic: "sign_in",
    recipient,
    inApp: {
      kind: "new_sign_in",
      payload: {
        ...deviceFacts(request.userAgent),
        ...(organizationName ? { organization: organizationName } : {}),
      },
      link: { type: "account", section: "sessions" },
      createdAt: request.at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("newSignIn.subject"),
      paragraphs: [t("newSignIn.body", { name, organization })],
      details: [
        ...(organizationName
          ? [{ label: t("details.signedInTo"), value: organizationName }]
          : []),
        ...requestDetails(t, locale, request),
      ],
      guidance: notYou(t, organizationSlug, t("newSignIn.guidance")),
      action: organizationSlug
        ? {
            label: t("actions.reviewSessions"),
            url: accountSectionUrl(organizationSlug, "sessions"),
          }
        : undefined,
    }),
  })
}

export function sendAccountDisabledNotice({
  recipient,
  at = new Date(),
  reason,
}: AccountStatusNoticeInput) {
  return sendAccountNotice({
    kind: "account-disabled",
    recipient,
    compose: ({ t, locale, organization, name }) => ({
      subject: t("accountDisabled.subject"),
      paragraphs: [t("accountDisabled.body", { name, organization })],
      details: [
        { label: t("details.when"), value: formatNoticeTime(at, locale) },
        // An administrator's own words, shown as written.
        ...(reason ? [{ label: t("details.reason"), value: reason }] : []),
      ],
      guidance: t("accountDisabled.guidance"),
    }),
  })
}

export function sendAccountEnabledNotice({
  recipient,
  at = new Date(),
  organizationSlug,
}: AccountStatusNoticeInput) {
  return sendAccountNotice({
    kind: "account-enabled",
    recipient,
    inApp: {
      kind: "account_enabled",
      payload: {},
      link: { type: "account", section: "security" },
      createdAt: at,
    },
    compose: ({ t, locale, organization, name }) => ({
      subject: t("accountEnabled.subject"),
      paragraphs: [t("accountEnabled.body", { name, organization })],
      details: [
        { label: t("details.when"), value: formatNoticeTime(at, locale) },
      ],
      guidance: t("accountEnabled.guidance"),
      action: organizationSlug
        ? { label: t("actions.signIn"), url: organizationUrl(organizationSlug) }
        : undefined,
    }),
  })
}
