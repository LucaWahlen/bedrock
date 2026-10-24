import { emailFormatter } from "@/features/shared/lib/email/format"
import {
  EmailButton,
  EmailFallbackLink,
  EmailLayout,
  EmailParagraph,
  type EmailBrand,
} from "@/features/shared/lib/email/templates/layout"
import type { Locale } from "@/features/shared/lib/i18n/config"
import { translatorFor } from "@/features/shared/lib/i18n/translator"

export type InvitationEmailProps = {
  brand: EmailBrand
  locale: Locale
  inviterName: string
  // "owner", "admin" or "member"; anything else reads as a member.
  role: string
  url: string
  expiresAt: Date
}

export function invitationSubject(
  brand: EmailBrand,
  locale: Locale,
  inviterName: string
) {
  return translatorFor(locale, "emails.invitation")("subject", {
    inviter: inviterName,
    organization: brand.organizationName,
  })
}

export function InvitationEmail({
  brand,
  locale,
  inviterName,
  role,
  url,
  expiresAt,
}: InvitationEmailProps) {
  const t = translatorFor(locale, "emails.invitation")
  const organization = brand.organizationName

  return (
    <EmailLayout
      brand={brand}
      locale={locale}
      preview={invitationSubject(brand, locale, inviterName)}
      heading={t("heading", { organization })}
      footer={t("footer", {
        expiresOn: emailFormatter(locale).dateTime(expiresAt, "date"),
      })}
    >
      <EmailParagraph>
        {t("body", { inviter: inviterName, organization, role })}
      </EmailParagraph>
      <EmailButton href={url} color={brand.color}>
        {t("button")}
      </EmailButton>
      <EmailFallbackLink href={url} locale={locale} />
    </EmailLayout>
  )
}
