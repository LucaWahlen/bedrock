import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"

import type { Locale } from "@/features/shared/lib/i18n/config"
import { translatorFor } from "@/features/shared/lib/i18n/translator"
import { contrastingForeground } from "@/features/shared/lib/ui/color"

export type EmailBrand = {
  organizationName: string
  /** Absolute, because a mail client has no origin to resolve against. */
  logoUrl: string | null
  color: string
}

// The app's own tokens, resolved out of oklch: no mail client understands it.
export const palette = {
  background: "#f5f5f5",
  card: "#ffffff",
  foreground: "#0a0a0a",
  muted: "#f5f5f5",
  mutedForeground: "#737373",
  border: "#e5e5e5",
  subtle: "#a3a3a3",
}

const fontFamily =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

export function EmailButton({
  href,
  color,
  children,
}: {
  href: string
  color: string
  children: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: color,
        color: contrastingForeground(color),
        fontSize: "14px",
        fontWeight: 500,
        lineHeight: "20px",
        textDecoration: "none",
        padding: "10px 18px",
        borderRadius: "8px",
      }}
    >
      {children}
    </Link>
  )
}

export function EmailParagraph({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: "14px",
        lineHeight: "22px",
        color: palette.mutedForeground,
        margin: "0 0 16px",
      }}
    >
      {children}
    </Text>
  )
}

export function EmailFallbackLink({
  href,
  locale,
}: {
  href: string
  locale: Locale
}) {
  const t = translatorFor(locale, "emails.layout")

  return (
    <>
      <Hr
        style={{
          borderColor: palette.border,
          borderWidth: "1px 0 0",
          margin: "28px 0 20px",
        }}
      />
      <Text
        style={{
          fontSize: "12px",
          lineHeight: "18px",
          color: palette.subtle,
          margin: "0 0 6px",
        }}
      >
        {t("fallbackLink")}
      </Text>
      <Text
        style={{
          fontSize: "12px",
          lineHeight: "18px",
          color: palette.mutedForeground,
          margin: 0,
          wordBreak: "break-all",
        }}
      >
        {href}
      </Text>
    </>
  )
}

export function EmailLayout({
  brand,
  locale,
  preview,
  heading,
  children,
  footer,
}: {
  brand: EmailBrand
  locale: Locale
  preview: string
  heading: string
  children: React.ReactNode
  footer?: string
}) {
  const t = translatorFor(locale, "emails.layout")

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: palette.background,
          fontFamily,
          margin: 0,
          padding: "40px 16px",
        }}
      >
        <Container
          style={{
            backgroundColor: palette.card,
            border: `1px solid ${palette.border}`,
            borderRadius: "10px",
            maxWidth: "480px",
            margin: "0 auto",
            padding: "32px",
          }}
        >
          <Section>
            <table cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  {brand.logoUrl && (
                    <td style={{ paddingRight: "10px" }}>
                      <Img
                        src={brand.logoUrl}
                        alt=""
                        width="28"
                        height="28"
                        style={{ borderRadius: "6px", display: "block" }}
                      />
                    </td>
                  )}
                  <td>
                    <Text
                      style={{
                        fontSize: "15px",
                        fontWeight: 500,
                        color: palette.foreground,
                        margin: 0,
                      }}
                    >
                      {brand.organizationName}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Heading
            as="h1"
            style={{
              fontSize: "20px",
              lineHeight: "28px",
              fontWeight: 600,
              color: palette.foreground,
              margin: "28px 0 12px",
            }}
          >
            {heading}
          </Heading>

          {children}

          <Hr
            style={{
              borderColor: palette.border,
              borderWidth: "1px 0 0",
              margin: "28px 0 16px",
            }}
          />
          <Text
            style={{
              fontSize: "12px",
              lineHeight: "18px",
              color: palette.subtle,
              margin: 0,
            }}
          >
            {footer ?? t("footer")}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
