import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import {
  ConsentPanel,
  describeScopes,
  getAuthorizationContext,
  signedOauthQuery,
} from "@/features/applications"
import { AuthShell, getAccessContext } from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type ConsentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("applications.pages.consent")

  return { title: t("metadataTitle") }
}

export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const query = await searchParams
  const clientId = typeof query.client_id === "string" ? query.client_id : ""
  const application = await getAuthorizationContext(clientId)

  if (!application) notFound()

  const organization = await getOrganizationBySlug(application.organizationSlug)
  if (!organization) notFound()

  // Consent is a decision only the account holder can make, so an expired
  // session goes back through sign-in carrying the same request.
  const access = await getAccessContext()
  if (!access.user) {
    redirect(`/oauth2/login?${signedOauthQuery(query)}`)
  }

  const t = await getTranslations("applications")

  return (
    <AuthShell organization={organization}>
      <ConsentPanel
        applicationName={application.name}
        organizationName={organization.name}
        userEmail={access.user.email}
        scopeDescriptions={describeScopes(
          t,
          typeof query.scope === "string" ? query.scope : undefined
        )}
        oauthQuery={signedOauthQuery(query)}
        parties={{
          brandColor: organization.color,
          user: {
            id: access.user.id,
            name: access.user.name,
            image: access.user.image,
          },
          application: {
            clientId,
            name: application.name,
            icon: application.icon,
          },
        }}
      />
    </AuthShell>
  )
}
