import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { getAuthorizationContext } from "@/features/applications"
import {
  AuthShell,
  getAccessContext,
  OidcLogoutPanel,
  type OidcLogoutState,
} from "@/features/auth"
import {
  getOrganizationBySlug,
  getRootOrganization,
} from "@/features/organizations"

type OidcEndSessionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parseLogoutState(value: unknown): OidcLogoutState | null {
  if (value === "confirm" || value === "logged-out" || value === "error") {
    return value
  }
  return null
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.metadata")

  return { title: t("signOut") }
}

export default async function OidcEndSessionPage({
  searchParams,
}: OidcEndSessionPageProps) {
  const query = await searchParams
  const clientId =
    typeof query.client_id === "string" && query.client_id.length > 0
      ? query.client_id
      : undefined
  const explicitState = parseLogoutState(query.state)
  const unregisteredRedirect = query.unregistered === "1"

  const [application, access] = await Promise.all([
    clientId ? getAuthorizationContext(clientId) : Promise.resolve(null),
    getAccessContext(),
  ])

  // Navigating straight to `/oauth2/end-session` while signed in has not set
  // the provider's signed confirmation cookie yet; routing through the
  // endpoint sets it before showing the confirmation form.
  if (!explicitState && access.user) {
    redirect(
      clientId
        ? `/api/auth/oauth2/end-session?client_id=${encodeURIComponent(clientId)}`
        : "/api/auth/oauth2/end-session"
    )
  }

  const organization = application
    ? await getOrganizationBySlug(application.organizationSlug)
    : await getRootOrganization()
  if (!organization) notFound()

  const state: OidcLogoutState = explicitState ?? "logged-out"

  return (
    <AuthShell organization={organization}>
      <OidcLogoutPanel
        state={state}
        organization={organization}
        applicationName={application?.name}
        launchUrl={application?.uri}
        clientId={application ? clientId : undefined}
        unregisteredRedirect={unregisteredRedirect}
      />
    </AuthShell>
  )
}
