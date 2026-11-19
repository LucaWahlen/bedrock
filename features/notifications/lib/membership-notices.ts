import {
  NoticeEmail,
  type NoticeAction,
} from "@/features/notifications/components/notice-email"
import {
  organizationUrl,
  sendNotice,
  type InAppNoticeSpec,
} from "@/features/notifications/lib/send-notice"
import type {
  MembershipNoticeInput,
  NoticeOrganization,
  NoticeRecipient,
  NotificationTopic,
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
  details?: { label: string; value: string }[]
}

// A membership is the organization's business, so these carry its branding.
function sendMembershipNotice({
  kind,
  topic = "membership",
  recipient,
  organization,
  at = new Date(),
  inApp,
  compose,
}: {
  kind: string
  topic?: NotificationTopic
  recipient: NoticeRecipient
  organization: NoticeOrganization
  at?: Date
  inApp: Omit<
    InAppNoticeSpec,
    "organizationId" | "organizationSlug" | "createdAt"
  >
  compose: (context: ComposeContext) => MembershipNotice
}) {
  return sendNotice({
    kind,
    topic,
    recipient,
    inApp: {
      ...inApp,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      createdAt: at,
    },
    compose: async (locale) => {
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
            ...(notice.details ?? []),
          ],
          guidance: notice.guidance,
          action: notice.action,
          footer: t("email.membershipFooter", {
            organization: organization.name,
          }),
        }),
      }
    },
  })
}

export function sendMemberAddedNotice({
  recipient,
  organization,
  actorName,
  role,
  at,
}: MembershipNoticeInput & { role: string }) {
  return sendMembershipNotice({
    kind: "member-added",
    recipient,
    organization,
    at,
    inApp: {
      kind: "member_added",
      payload: {
        organization: organization.name,
        actor: actorName,
        role,
      },
      link: { type: "organization", slug: organization.slug, path: "" },
    },
    compose: ({ t, locale, name, organization: organizationName }) => ({
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
    }),
  })
}

export function sendMemberRoleChangedNotice({
  recipient,
  organization,
  actorName,
  from,
  to,
  at,
}: MembershipNoticeInput & { from: string[]; to: string }) {
  return sendMembershipNotice({
    kind: "member-role-changed",
    recipient,
    organization,
    at,
    inApp: {
      kind: "member_role_changed",
      payload: {
        organization: organization.name,
        actor: actorName,
        from,
        to,
      },
      link: { type: "organization", slug: organization.slug, path: "" },
    },
    compose: ({ t, locale, name, organization: organizationName }) => ({
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
    }),
  })
}

// Sent to every owner of the organization, whose own audit log shows the rest.
export function sendBreakGlassStartedNotice({
  recipient,
  organization,
  actorName,
  reason,
  expiresAt,
  at = new Date(),
}: MembershipNoticeInput & { reason: string; expiresAt: Date }) {
  const minutes = Math.max(
    1,
    Math.round((expiresAt.getTime() - at.getTime()) / 60_000)
  )

  return sendMembershipNotice({
    kind: "break-glass-started",
    topic: "break_glass",
    recipient,
    organization,
    at,
    inApp: {
      kind: "break_glass_started",
      payload: {
        organization: organization.name,
        actor: actorName,
        minutes,
      },
      link: {
        type: "organization",
        slug: organization.slug,
        path: "/audit-log",
      },
    },
    compose: ({ t, locale, name, organization: organizationName }) => ({
      subject: t("breakGlassStarted.subject", {
        organization: organizationName,
      }),
      paragraphs: [
        t("breakGlassStarted.body", {
          name,
          actor: actorName,
          organization: organizationName,
          minutes,
        }),
      ],
      details: [
        { label: t("details.reason"), value: reason },
        {
          label: t("details.expires"),
          value: formatNoticeTime(expiresAt, locale),
        },
      ],
      guidance: t("breakGlassStarted.guidance"),
      action: {
        label: t("actions.openAuditLog"),
        url: organizationUrl(organization.slug, "/audit-log"),
      },
    }),
  })
}

export function sendMemberRemovedNotice({
  recipient,
  organization,
  actorName,
  at,
}: MembershipNoticeInput) {
  return sendMembershipNotice({
    kind: "member-removed",
    recipient,
    organization,
    at,
    inApp: {
      kind: "member_removed",
      payload: {
        organization: organization.name,
        actor: actorName,
      },
      link: null,
    },
    compose: ({ t, name, organization: organizationName }) => ({
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
    }),
  })
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
  return sendMembershipNotice({
    kind: "invitation-accepted",
    topic: "invitations",
    recipient,
    organization,
    at,
    inApp: {
      kind: "invitation_accepted",
      payload: {
        organization: organization.name,
        invitee: invitee.name,
        role,
      },
      link: { type: "organization", slug: organization.slug, path: "/members" },
    },
    compose: ({ t, locale, name, organization: organizationName }) => ({
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
    }),
  })
}

export function sendMemberJoinedNotice({
  recipient,
  organization,
  member,
  role = "member",
  at,
}: Omit<MembershipNoticeInput, "actorName"> & {
  member: NoticeRecipient
  role?: string
}) {
  return sendMembershipNotice({
    kind: "member-joined",
    topic: "member_activity",
    recipient,
    organization,
    at,
    inApp: {
      kind: "member_joined",
      payload: {
        organization: organization.name,
        member: member.name,
        role,
      },
      link: { type: "organization", slug: organization.slug, path: "/members" },
    },
    compose: ({ t, locale, name, organization: organizationName }) => ({
      subject: t("memberJoined.subject", {
        member: member.name,
        organization: organizationName,
      }),
      paragraphs: [
        t("memberJoined.body", {
          name,
          member: member.name,
          memberEmail: member.email,
          organization: organizationName,
          role: rolePhrase(role, locale),
        }),
      ],
      guidance: t("memberJoined.guidance", {
        organization: organizationName,
      }),
      action: {
        label: t("actions.viewMembers"),
        url: organizationUrl(organization.slug, "/members"),
      },
    }),
  })
}

export function sendMemberLeftNotice({
  recipient,
  organization,
  member,
  at,
}: Omit<MembershipNoticeInput, "actorName"> & {
  member: NoticeRecipient
}) {
  return sendMembershipNotice({
    kind: "member-left",
    topic: "member_activity",
    recipient,
    organization,
    at,
    inApp: {
      kind: "member_left",
      payload: {
        organization: organization.name,
        member: member.name,
      },
      link: { type: "organization", slug: organization.slug, path: "/members" },
    },
    compose: ({ t, name, organization: organizationName }) => ({
      subject: t("memberLeft.subject", {
        member: member.name,
        organization: organizationName,
      }),
      paragraphs: [
        t("memberLeft.body", {
          name,
          member: member.name,
          memberEmail: member.email,
          organization: organizationName,
        }),
      ],
      guidance: t("memberLeft.guidance", {
        organization: organizationName,
      }),
      action: {
        label: t("actions.viewMembers"),
        url: organizationUrl(organization.slug, "/members"),
      },
    }),
  })
}

export function sendUserSignedUpNotice({
  recipient,
  organization,
  newUser,
  at,
}: Omit<MembershipNoticeInput, "actorName"> & {
  newUser: NoticeRecipient
}) {
  return sendMembershipNotice({
    kind: "user-signed-up",
    topic: "member_activity",
    recipient,
    organization,
    at,
    inApp: {
      kind: "user_signed_up",
      payload: {
        organization: organization.name,
        member: newUser.name,
      },
      link: {
        type: "organization",
        slug: organization.slug,
        path: "/directory",
      },
    },
    compose: ({ t, name, organization: organizationName }) => ({
      subject: t("userSignedUp.subject", {
        member: newUser.name,
        organization: organizationName,
      }),
      paragraphs: [
        t("userSignedUp.body", {
          name,
          member: newUser.name,
          memberEmail: newUser.email,
          organization: organizationName,
        }),
      ],
      guidance: t("userSignedUp.guidance"),
      action: {
        label: t("actions.openDirectory"),
        url: organizationUrl(organization.slug, "/directory"),
      },
    }),
  })
}
