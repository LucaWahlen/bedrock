import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { AccountSecurityNudge } from "@/features/account"
import { AppHeader, appCapabilities, OverviewDashboard } from "@/features/app"
import {
  canAccessOrganization,
  getAccessContext,
  membershipIn,
} from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type OverviewPageProps = PageProps<"/org/[slug]">

export default async function OverviewPage({ params }: OverviewPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  // The layout guards the shell; the page decides its own sections again
  // rather than trusting what the layout saw.
  const access = await getAccessContext()
  const membership = membershipIn(access, currentOrganization.id)
  if (!membership || !canAccessOrganization(membership)) {
    redirect(`/org/${slug}/forbidden`)
  }

  const [t, capabilities] = await Promise.all([
    getTranslations("app.navigation"),
    appCapabilities(access, membership),
  ])

  return (
    <>
      <AppHeader
        title={t("items.overview")}
        organization={currentOrganization}
      />
      <OverviewDashboard
        organization={currentOrganization}
        capabilities={capabilities}
        // Decided here, so the prompt is in the first render rather than
        // pushing the page down once something on the client finds out.
        accountNudge={
          access.user?.hasSecondFactor === false ? (
            <AccountSecurityNudge />
          ) : undefined
        }
      />
    </>
  )
}
