import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { AppHeader, requireOrganizationAdministration } from "@/features/app"
import {
  AuthenticationSettings,
  getOrganizationAuthentication,
  getOrganizationBySlug,
} from "@/features/organizations"

type AuthenticationPageProps = PageProps<"/org/[slug]/authentication">

export async function generateMetadata({
  params,
}: AuthenticationPageProps): Promise<Metadata> {
  const { slug } = await params
  const [t, currentOrganization] = await Promise.all([
    getTranslations("organizations.pages"),
    getOrganizationBySlug(slug),
  ])

  return {
    title: currentOrganization
      ? t("titleWithOrganization", {
          page: t("authentication"),
          organization: currentOrganization.name,
        })
      : t("authentication"),
  }
}

export default async function AuthenticationPage({
  params,
}: AuthenticationPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  // Root's members are the instance's administrators, whose sign-in is not a
  // tenant policy, so root has no such page.
  if (!currentOrganization || currentOrganization.isRoot) notFound()

  await requireOrganizationAdministration(currentOrganization.id, slug)
  const {
    allowPublicSignUp,
    requireTwoFactor,
    memberCount,
    nonCompliantCount,
    viewerHasSecondFactor,
    capabilities,
  } = await getOrganizationAuthentication(currentOrganization.id)

  const t = await getTranslations("organizations.pages")

  return (
    <>
      <AppHeader
        title={t("authentication")}
        organization={currentOrganization}
      />
      <AuthenticationSettings
        organization={currentOrganization}
        authentication={{
          allowPublicSignUp,
          requireTwoFactor,
          memberCount,
          nonCompliantCount,
          viewerHasSecondFactor,
          capabilities,
        }}
      />
    </>
  )
}
