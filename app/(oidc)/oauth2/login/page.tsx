import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { authorizeUrl, getAuthorizationContext } from "@/features/applications"
import { AuthShell, OidcLoginForm } from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type OidcLoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.metadata")

  return { title: t("signIn") }
}

export default async function OidcLoginPage({
  searchParams,
}: OidcLoginPageProps) {
  const query = await searchParams
  const clientId = typeof query.client_id === "string" ? query.client_id : ""
  const application = await getAuthorizationContext(clientId)

  // An unknown or disabled application gets a plain 404. Explaining which of
  // the two it is would answer questions for whoever is guessing client ids.
  if (!application) notFound()

  const organization = await getOrganizationBySlug(application.organizationSlug)
  if (!organization) notFound()

  return (
    <AuthShell organization={organization}>
      <OidcLoginForm
        applicationName={application.name}
        organizationSlug={organization.slug}
        authorizeUrl={authorizeUrl(query)}
      />
    </AuthShell>
  )
}
