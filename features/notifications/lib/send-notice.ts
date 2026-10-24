import type { ReactElement } from "react"

import { recipientLocale } from "@/features/notifications/actions/recipient-locale"
import type { NoticeRecipient } from "@/features/notifications/types"
import { absoluteUrl } from "@/features/shared/lib/app-url"
import { emailLocale } from "@/features/shared/lib/email/locale"
import { renderEmail } from "@/features/shared/lib/email/render"
import { sendEmail } from "@/features/shared/lib/email/send"
import type { Locale } from "@/features/shared/lib/i18n/config"

export function organizationUrl(slug: string, path = "") {
  return absoluteUrl(`/org/${slug}${path}`)
}

// The account dialog opens on whichever section `?account=` names.
export function accountSectionUrl(
  slug: string,
  section: "security" | "sessions" | "password"
) {
  return absoluteUrl(`/org/${slug}?account=${section}`)
}

/**
 * Written in the recipient's language: the one they chose, found by
 * `accountEmail` when the notice goes to an address the account has left.
 *
 * Never throws: a notice is best effort, and its failure is logged by kind
 * alone. The transport already logs its own failures without the message.
 */
export async function sendNotice(
  kind: string,
  recipient: NoticeRecipient,
  compose: (
    locale: Locale
  ) => Promise<{ subject: string; element: ReactElement }>,
  accountEmail = recipient.email
) {
  try {
    const locale = await emailLocale(
      recipient.locale ?? (await recipientLocale(accountEmail))
    )
    const { subject, element } = await compose(locale)

    return await sendEmail({
      to: { name: recipient.name, address: recipient.email },
      subject,
      ...(await renderEmail(element)),
    })
  } catch (error) {
    console.error(
      `[notifications] ${kind} notice could not be sent`,
      error instanceof Error ? error.message : error
    )
    return false
  }
}
