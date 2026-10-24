import { Section, Text } from "@react-email/components"

import {
  EmailButton,
  EmailFallbackLink,
  EmailLayout,
  EmailParagraph,
  palette,
  type EmailBrand,
} from "@/features/shared/lib/email/templates/layout"
import type { Locale } from "@/features/shared/lib/i18n/config"
import { translatorFor } from "@/features/shared/lib/i18n/translator"

export type NoticeDetail = { label: string; value: string }

export type NoticeAction = { label: string; url: string }

export type NoticeEmailProps = {
  brand: EmailBrand
  locale: Locale
  preview: string
  heading: string
  paragraphs: string[]
  details?: NoticeDetail[]
  // What to do if the recipient did not expect this.
  guidance?: string
  action?: NoticeAction
  footer?: string
}

function NoticeDetails({ details }: { details: NoticeDetail[] }) {
  return (
    <Section
      style={{
        backgroundColor: palette.muted,
        border: `1px solid ${palette.border}`,
        borderRadius: "8px",
        padding: "12px 16px",
        margin: "0 0 16px",
      }}
    >
      {details.map((detail) => (
        <Text
          key={detail.label}
          style={{
            fontSize: "13px",
            lineHeight: "20px",
            color: palette.foreground,
            margin: 0,
          }}
        >
          <span style={{ color: palette.mutedForeground }}>
            {detail.label}:
          </span>{" "}
          {detail.value}
        </Text>
      ))}
    </Section>
  )
}

/**
 * Every account and membership notice: what happened, the facts that place it,
 * and what to do about it. Never a code, token or password, so the mail is
 * harmless to whoever else might read it.
 */
export function NoticeEmail({
  brand,
  locale,
  preview,
  heading,
  paragraphs,
  details,
  guidance,
  action,
  footer,
}: NoticeEmailProps) {
  const t = translatorFor(locale, "notifications.email")

  return (
    <EmailLayout
      brand={brand}
      locale={locale}
      preview={preview}
      heading={heading}
      footer={
        footer ?? t("accountFooter", { organization: brand.organizationName })
      }
    >
      {paragraphs.map((paragraph) => (
        <EmailParagraph key={paragraph}>{paragraph}</EmailParagraph>
      ))}
      {details && details.length > 0 && <NoticeDetails details={details} />}
      {guidance && <EmailParagraph>{guidance}</EmailParagraph>}
      {action && (
        <>
          <EmailButton href={action.url} color={brand.color}>
            {action.label}
          </EmailButton>
          <EmailFallbackLink href={action.url} locale={locale} />
        </>
      )}
    </EmailLayout>
  )
}
