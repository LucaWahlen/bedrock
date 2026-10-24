import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { AppHeader, requireOrganizationAdministration } from "@/features/app"
import { hasRole } from "@/features/auth"
import {
  getOrganizationBySlug,
  OrganizationSettings,
} from "@/features/organizations"

type SettingsPageProps = PageProps<"/org/[slug]/settings">

export async function generateMetadata({
  params,
}: SettingsPageProps): Promise<Metadata> {
  const { slug } = await params
  const [t, currentOrganization] = await Promise.all([
    getTranslations("organizations.pages"),
    getOrganizationBySlug(slug),
  ])

  return {
    title: currentOrganization
      ? t("titleWithOrganization", {
          page: t("settings"),
          organization: currentOrganization.name,
        })
      : t("settings"),
  }
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  // Root's identity is seeded once from configuration and has nothing to
  // configure, so it has no settings page at all.
  if (!currentOrganization || currentOrganization.isRoot) notFound()

  const membership = await requireOrganizationAdministration(
    currentOrganization.id,
    slug
  )

  const isOwner = hasRole(membership.role, "owner")

  const t = await getTranslations("organizations.pages")

  return (
    <>
      <AppHeader title={t("settings")} organization={currentOrganization} />
      <OrganizationSettings
        organization={currentOrganization}
        capabilities={{
          canEditProfile: true,
          canChangeSlug: isOwner,
          canDeleteOrganization: isOwner,
        }}
      />
    </>
  )
}
