import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { SecuritySetup } from "@/features/account"
import { authorizeUrl, getAuthorizationContext } from "@/features/applications"
import {
  AuthShell,
  awaitsSecondFactor,
  canAccessOrganization,
  getAccessContext,
  heldMembershipIn,
  securitySetupContinueHref,
} from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type SetupSecurityPageProps = {
  params: Promise<{ slug: string }>
  // An authorization the gate interrupted, carried so it can be resumed.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  params,
}: SetupSecurityPageProps): Promise<Metadata> {
  const { slug } = await params
  const [currentOrganization, t] = await Promise.all([
    getOrganizationBySlug(slug),
    getTranslations("account"),
  ])

  return {
    title: currentOrganization
      ? t("metadata.setupSecurityIn", {
          organization: currentOrganization.name,
        })
      : t("metadata.setupSecurity"),
  }
}

// Outside the application shell on purpose: a member without the second factor
// their organization requires holds a membership that grants nothing yet, so
// the only thing on offer is enrolling one.
export default async function Page({
  params,
  searchParams,
}: SetupSecurityPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  const access = await getAccessContext()
  if (!access.user) redirect(`/org/${slug}/login`)
  if (!access.user.emailVerified) redirect(`/org/${slug}/verify-email`)

  const membership = heldMembershipIn(access, currentOrganization.id)
  if (!membership) redirect(`/org/${slug}/forbidden`)
  if (!canAccessOrganization(membership)) redirect(`/org/${slug}/suspended`)

  const query = await searchParams
  const clientId = typeof query.client_id === "string" ? query.client_id : ""
  const application = clientId ? await getAuthorizationContext(clientId) : null
  const continuation = securitySetupContinueHref({
    organizationSlug: currentOrganization.slug,
    applicationOrganizationSlug: application?.organizationSlug ?? null,
    authorizeHref: application ? authorizeUrl(query) : null,
  })

  // Nothing to set up for someone already compliant, or for an organization
  // that does not ask. The application shell, or the interrupted
  // authorization, takes it from here.
  if (!awaitsSecondFactor(access, membership)) redirect(continuation.href)

  const t = await getTranslations("account")

  return (
    <AuthShell organization={currentOrganization} wide>
      <SecuritySetup
        organizationName={currentOrganization.name}
        continueHref={continuation.href}
        continueLabel={t("setup.continue", {
          name:
            continuation.resumesAuthorization && application
              ? application.name
              : currentOrganization.name,
        })}
        resumesAuthorization={continuation.resumesAuthorization}
        signOutHref={`/org/${slug}/logout`}
      />
    </AuthShell>
  )
}
