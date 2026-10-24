import {
  EmailButton,
  EmailFallbackLink,
  EmailLayout,
  EmailParagraph,
  type EmailBrand,
} from "@/features/shared/lib/email/templates/layout"
import type { Locale } from "@/features/shared/lib/i18n/config"
import { translatorFor } from "@/features/shared/lib/i18n/translator"

export type ResetPasswordEmailProps = {
  brand: EmailBrand
  locale: Locale
  name: string
  url: string
}

export function resetPasswordSubject(brand: EmailBrand, locale: Locale) {
  return translatorFor(locale, "emails.resetPassword")("subject", {
    organization: brand.organizationName,
  })
}

export function ResetPasswordEmail({
  brand,
  locale,
  name,
  url,
}: ResetPasswordEmailProps) {
  const t = translatorFor(locale, "emails.resetPassword")
  const organization = brand.organizationName

  return (
    <EmailLayout
      brand={brand}
      locale={locale}
      preview={resetPasswordSubject(brand, locale)}
      heading={t("heading")}
      footer={t("footer")}
    >
      <EmailParagraph>{t("body", { name, organization })}</EmailParagraph>
      <EmailButton href={url} color={brand.color}>
        {t("button")}
      </EmailButton>
      <EmailFallbackLink href={url} locale={locale} />
    </EmailLayout>
  )
}
