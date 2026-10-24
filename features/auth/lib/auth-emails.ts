import { eq } from "drizzle-orm"

import {
  invitationTokenFromAuthUrl,
  organizationSlugFromAuthUrl,
  resetPasswordLink,
  verifyEmailLink,
} from "@/features/auth/lib/email-links"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"
import { emailLocale } from "@/features/shared/lib/email/locale"
import { emailBrand, renderEmail } from "@/features/shared/lib/email/render"
import { sendEmail } from "@/features/shared/lib/email/send"
import {
  ResetPasswordEmail,
  resetPasswordSubject,
} from "@/features/shared/lib/email/templates/reset-password-email"
import {
  VerifyEmail,
  verifyEmailSubject,
} from "@/features/shared/lib/email/templates/verify-email"

// `locale` is the account's own choice, declared to Better Auth in `auth.ts`.
type AuthEmailUser = { name: string; email: string; locale?: string | null }

// Not an action: `auth.ts` cannot import from `actions/` without collapsing its
// own inferred type, and these are only ever called by Better Auth itself.
async function brandFor(slug: string) {
  const [row] = await db
    .select({
      name: organization.name,
      logo: organization.logo,
      color: organization.color,
    })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)

  return emailBrand(row ?? { name: env.rootOrganization.name })
}

export async function sendVerificationMail({
  user,
  url,
  token,
}: {
  user: AuthEmailUser
  url: string
  token: string
}) {
  const slug = organizationSlugFromAuthUrl(url)
  const [brand, locale] = await Promise.all([
    brandFor(slug),
    emailLocale(user.locale),
  ])
  const link = verifyEmailLink(slug, token)

  await sendEmail({
    to: { name: user.name, address: user.email },
    subject: verifyEmailSubject(brand, locale),
    ...(await renderEmail(
      VerifyEmail({ brand, locale, name: user.name, url: link })
    )),
  })
}

export async function sendResetPasswordMail({
  user,
  url,
  token,
}: {
  user: AuthEmailUser
  url: string
  token: string
}) {
  const slug = organizationSlugFromAuthUrl(url)
  const [brand, locale] = await Promise.all([
    brandFor(slug),
    emailLocale(user.locale),
  ])
  const link = resetPasswordLink(slug, token, invitationTokenFromAuthUrl(url))

  await sendEmail({
    to: { name: user.name, address: user.email },
    subject: resetPasswordSubject(brand, locale),
    ...(await renderEmail(
      ResetPasswordEmail({ brand, locale, name: user.name, url: link })
    )),
  })
}
