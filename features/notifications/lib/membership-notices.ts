import {
  NoticeEmail,
  type NoticeAction,
} from "@/features/notifications/components/notice-email"
import {
  organizationUrl,
  sendNotice,
} from "@/features/notifications/lib/send-notice"
import type {
  MembershipNoticeInput,
  NoticeOrganization,
  NoticeRecipient,
} from "@/features/notifications/types"
import {
  formatNoticeTime,
  rolePhrase,
  rolesPhrase,
} from "@/features/notifications/utils/notice-format"
import { emailBrand } from "@/features/shared/lib/email/render"
import type { Locale } from "@/features/shared/lib/i18n/config"
import {
  translatorFor,
  type Translator,
} from "@/features/shared/lib/i18n/translator"

type ComposeContext = {
  t: Translator<"notifications">
  locale: Locale
  name: string
  organization: string
}

type MembershipNotice = {
  subject: string
  paragraphs: string[]
  guidance: string
  action?: NoticeAction
}

// A membership is the organization's business, so these carry its branding.
function sendMembershipNotice(
  kind: string,
  {
    recipient,
    organization,
    at = new Date(),
  }: {
    recipient: NoticeRecipient
    organization: NoticeOrganization
    at?: Date
  },
  compose: (context: ComposeContext) => MembershipNotice
) {
  return sendNotice(kind, recipient, async (locale) => {
    const t = translatorFor(locale, "notifications")
    const notice = compose({
      t,
      locale,
      name: recipient.name,
      organization: organization.name,
    })

    return {
      subject: notice.subject,
      element: NoticeEmail({
        brand: emailBrand(organization),
        locale,
        preview: notice.subject,
        heading: notice.subject,
        paragraphs: notice.paragraphs,
        details: [
          { label: t("details.organization"), value: organization.name },
          { label: t("details.when"), value: formatNoticeTime(at, locale) },
        ],
        guidance: notice.guidance,
        action: notice.action,
        footer: t("email.membershipFooter", {
          organization: organization.name,
        }),
      }),
    }
  })
}

export function sendMemberAddedNotice({
  recipient,
  organization,
  actorName,
  role,
  at,
}: MembershipNoticeInput & { role: string }) {
  return sendMembershipNotice(
    "member-added",
    { recipient, organization, at },
    ({ t, locale, name, organization: organizationName }) => ({
      subject: t("memberAdded.subject", { organization: organizationName }),
      paragraphs: [
        t("memberAdded.body", {
          name,
          actor: actorName,
          organization: organizationName,
          role: rolePhrase(role, locale),
        }),
      ],
      guidance: t("memberAdded.guidance", { organization: organizationName }),
      action: {
        label: t("actions.openOrganization", {
          organization: organizationName,
        }),
        url: organizationUrl(organization.slug),
      },
    })
  )
}

export function sendMemberRoleChangedNotice({
  recipient,
  organization,
  actorName,
  from,
  to,
  at,
}: MembershipNoticeInput & { from: string[]; to: string }) {
  return sendMembershipNotice(
    "member-role-changed",
    { recipient, organization, at },
    ({ t, locale, name, organization: organizationName }) => ({
      subject: t("memberRoleChanged.subject", {
        organization: organizationName,
      }),
      paragraphs: [
        t("memberRoleChanged.body", {
          name,
          actor: actorName,
          organization: organizationName,
          from: rolesPhrase(from, locale),
          to: rolePhrase(to, locale),
        }),
      ],
      guidance: t("memberRoleChanged.guidance", {
        organization: organizationName,
      }),
      action: {
        label: t("actions.openOrganization", {
          organization: organizationName,
        }),
        url: organizationUrl(organization.slug),
      },
    })
  )
}

export function sendMemberRemovedNotice({
  recipient,
  organization,
  actorName,
  at,
}: MembershipNoticeInput) {
  return sendMembershipNotice(
    "member-removed",
    { recipient, organization, at },
    ({ t, name, organization: organizationName }) => ({
      subject: t("memberRemoved.subject", { organization: organizationName }),
      paragraphs: [
        t("memberRemoved.body", {
          name,
          actor: actorName,
          organization: organizationName,
        }),
      ],
      guidance: t("memberRemoved.guidance", {
        organization: organizationName,
      }),
    })
  )
}

export function sendInvitationAcceptedNotice({
  recipient,
  organization,
  invitee,
  role,
  at,
}: Omit<MembershipNoticeInput, "actorName"> & {
  invitee: NoticeRecipient
  role: string
}) {
  return sendMembershipNotice(
    "invitation-accepted",
    { recipient, organization, at },
    ({ t, locale, name, organization: organizationName }) => ({
      subject: t("invitationAccepted.subject", {
        invitee: invitee.name,
        organization: organizationName,
      }),
      paragraphs: [
        t("invitationAccepted.body", {
          name,
          invitee: invitee.name,
          inviteeEmail: invitee.email,
          organization: organizationName,
          role: rolePhrase(role, locale),
        }),
      ],
      guidance: t("invitationAccepted.guidance", {
        organization: organizationName,
      }),
      action: {
        label: t("actions.viewMembers"),
        url: organizationUrl(organization.slug, "/members"),
      },
    })
  )
}
