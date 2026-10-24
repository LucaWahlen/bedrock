import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import {
  AppHeader,
  InstanceUsageDashboard,
  OrganizationUsageDashboard,
  requireOrganizationAdministration,
} from "@/features/app"
import { getAccessContext, isRootAdministrator } from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"
import { loadUsageSearchParams } from "@/features/usage"

type UsagePageProps = PageProps<"/org/[slug]/usage">

export async function generateMetadata({
  params,
}: UsagePageProps): Promise<Metadata> {
  const { slug } = await params
  const [currentOrganization, t] = await Promise.all([
    getOrganizationBySlug(slug),
    getTranslations("app.navigation.items"),
  ])

  return {
    title: currentOrganization
      ? `${t("usage")} | ${currentOrganization.name}`
      : t("usage"),
  }
}

// Root's usage is the instance's, for root administrators; a tenant's is its
// own, for its owners and admins. Neither grants the other.
export default async function UsagePage({
  params,
  searchParams,
}: UsagePageProps) {
  const [{ slug }, { period }] = await Promise.all([
    params,
    loadUsageSearchParams(searchParams),
  ])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  if (currentOrganization.isRoot) {
    if (!isRootAdministrator(await getAccessContext())) {
      redirect(`/org/${slug}/forbidden`)
    }
  } else {
    await requireOrganizationAdministration(currentOrganization.id, slug)
  }
  const t = await getTranslations("app.navigation.items")

  return (
    <>
      <AppHeader title={t("usage")} organization={currentOrganization} />
      {currentOrganization.isRoot ? (
        <InstanceUsageDashboard
          organization={currentOrganization}
          period={period}
        />
      ) : (
        <OrganizationUsageDashboard
          organization={currentOrganization}
          period={period}
        />
      )}
    </>
  )
}
