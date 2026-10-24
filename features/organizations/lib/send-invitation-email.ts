import { recipientLocale } from "@/features/notifications"
import { invitationLink } from "@/features/organizations/lib/invitations"
import type { MemberRole } from "@/features/organizations/types"
import { emailLocale } from "@/features/shared/lib/email/locale"
import { emailBrand, renderEmail } from "@/features/shared/lib/email/render"
import { sendEmail } from "@/features/shared/lib/email/send"
import {
  InvitationEmail,
  invitationSubject,
} from "@/features/shared/lib/email/templates/invitation-email"

/**
 * Written in the invitee's own language when the address already has an
 * account that chose one, and otherwise in the inviter's: the language of the
 * request that sends it.
 */
export async function sendInvitationEmail({
  organization,
  email,
  role,
  inviterName,
  token,
  expiresAt,
}: {
  organization: {
    name: string
    slug: string
    logo: string | null
    color: string | null
  }
  email: string
  role: MemberRole
  inviterName: string
  token: string
  expiresAt: Date
}) {
  const brand = emailBrand(organization)
  const url = invitationLink(organization.slug, token)
  const locale = await emailLocale(await recipientLocale(email))

  return sendEmail({
    to: { address: email },
    subject: invitationSubject(brand, locale, inviterName),
    ...(await renderEmail(
      InvitationEmail({ brand, locale, inviterName, role, url, expiresAt })
    )),
  })
}
