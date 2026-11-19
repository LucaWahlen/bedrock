import type { ReactElement } from "react"

import { recordInAppNotification } from "@/features/notifications/actions/record-in-app-notification"
import { resolveNoticeDelivery } from "@/features/notifications/actions/resolve-notice-delivery"
import { deliveryAuthority } from "@/features/notifications/lib/delivery-authority"
import type {
  NoticeRecipient,
  NotificationKind,
  NotificationLink,
  NotificationPayload,
  NotificationTopic,
} from "@/features/notifications/types"
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

export type InAppNoticeSpec = {
  kind: NotificationKind
  organizationId?: string
  organizationSlug?: string
  payload: NotificationPayload
  link: NotificationLink | null
  createdAt?: Date
}

/**
 * Delivers a notice across the channels its recipient's preferences allow,
 * writing the mail in their chosen language (looked up by `accountEmail` when
 * the notice goes to an address the account has left).
 *
 * In-app recording and SMTP delivery are isolated from one another so a failure
 * in either never drops the other, and `sendNotice` itself never throws.
 */
export async function sendNotice({
  kind,
  topic,
  recipient,
  compose,
  inApp,
  accountEmail = recipient.email,
}: {
  kind: string
  topic: NotificationTopic
  recipient: NoticeRecipient
  compose: (
    locale: Locale
  ) => Promise<{ subject: string; element: ReactElement }>
  inApp?: InAppNoticeSpec
  accountEmail?: string
}) {
  try {
    const delivery = await resolveNoticeDelivery(deliveryAuthority, {
      userId: recipient.id,
      accountEmail,
      preferenceKind: inApp?.kind,
      organizationId: inApp?.organizationId,
      organizationSlug: inApp?.organizationSlug,
    })

    const recordPromise =
      inApp && delivery.sendInApp && delivery.userId
        ? recordInAppNotification(deliveryAuthority, {
            userId: delivery.userId,
            organizationId: delivery.organizationId,
            topic,
            kind: inApp.kind,
            payload: inApp.payload,
            link: inApp.link,
            createdAt: inApp.createdAt,
          })
            .then(() => true)
            .catch((error) => {
              console.error(
                `[notifications] ${kind} in-app notice could not be recorded`,
                error instanceof Error ? error.message : error
              )
              return false
            })
        : Promise.resolve(false)

    const mailPromise = delivery.sendEmail
      ? (async () => {
          try {
            const locale = await emailLocale(
              recipient.locale ?? delivery.locale
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
        })()
      : Promise.resolve(false)

    const [recorded, mailed] = await Promise.all([recordPromise, mailPromise])

    return recorded || mailed
  } catch (error) {
    console.error(
      `[notifications] ${kind} notice could not be delivered`,
      error instanceof Error ? error.message : error
    )
    return false
  }
}
