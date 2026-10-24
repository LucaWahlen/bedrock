import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { AppHeader, HealthDashboard } from "@/features/app"
import { getAccessContext, isRootAdministrator } from "@/features/auth"
import { getOrganizationBySlug } from "@/features/organizations"

type HealthPageProps = PageProps<"/org/[slug]/health">

export async function generateMetadata({
  params,
}: HealthPageProps): Promise<Metadata> {
  const { slug } = await params
  const [currentOrganization, t] = await Promise.all([
    getOrganizationBySlug(slug),
    getTranslations("app.navigation.items"),
  ])

  return {
    title: currentOrganization
      ? `${t("health")} | ${currentOrganization.name}`
      : t("health"),
  }
}

export default async function HealthPage({ params }: HealthPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  // The instance's health is root's alone; a tenant has no such page.
  if (!currentOrganization?.isRoot) notFound()

  if (!isRootAdministrator(await getAccessContext())) {
    redirect(`/org/${slug}/forbidden`)
  }
  const t = await getTranslations("app.navigation.items")

  return (
    <>
      <AppHeader title={t("health")} organization={currentOrganization} />
      <HealthDashboard />
    </>
  )
}
