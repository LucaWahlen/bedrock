import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { authorizeUrl, getAuthorizationContext } from "@/features/applications"
import { AuthShell, getPendingTwoFactor, TwoFactorForm } from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type OidcTwoFactorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.metadata")

  return { title: t("twoFactor") }
}

// The second step of `/oauth2/login`, carrying the same signed authorization
// query so that finishing it resumes the request the provider interrupted.
export default async function OidcTwoFactorPage({
  searchParams,
}: OidcTwoFactorPageProps) {
  const query = await searchParams
  const clientId = typeof query.client_id === "string" ? query.client_id : ""
  const application = await getAuthorizationContext(clientId)
  if (!application) notFound()

  const organization = await getOrganizationBySlug(application.organizationSlug)
  if (!organization) notFound()

  const loginHref = `/oauth2/login?${new URLSearchParams(
    Object.entries(query).flatMap(([key, value]) =>
      value === undefined
        ? []
        : (Array.isArray(value) ? value : [value]).map((entry) => [key, entry])
    )
  ).toString()}`

  if (!(await getPendingTwoFactor())) redirect(loginHref)

  return (
    <AuthShell organization={organization}>
      <TwoFactorForm
        organizationSlug={organization.slug}
        restartHref={loginHref}
        authorizeUrl={authorizeUrl(query)}
      />
    </AuthShell>
  )
}
