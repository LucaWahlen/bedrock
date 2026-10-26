import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { AppHeader, requireOrganizationAdministration } from "@/features/app"
import {
  APPLICATION_ROLES_PAGE_SIZE,
  getApplicationOptions,
  getApplicationRoles,
  loadApplicationRolesSearchParams,
  RolesPanel,
} from "@/features/applications"
import { getGroupOptions } from "@/features/groups"
import { getOrganizationBySlug } from "@/features/organizations"

type RolesPageProps = PageProps<"/org/[slug]/roles">

export async function generateMetadata({
  params,
}: RolesPageProps): Promise<Metadata> {
  const { slug } = await params
  const [currentOrganization, t] = await Promise.all([
    getOrganizationBySlug(slug),
    getTranslations("app.navigation.items"),
  ])

  return {
    title: currentOrganization
      ? `${t("roles")} | ${currentOrganization.name}`
      : t("roles"),
  }
}

export default async function RolesPage({
  params,
  searchParams,
}: RolesPageProps) {
  const [{ slug }, { search, application, sort, direction, page }] =
    await Promise.all([params, loadApplicationRolesSearchParams(searchParams)])
  const [currentOrganization, t] = await Promise.all([
    getOrganizationBySlug(slug),
    getTranslations("app.navigation.items"),
  ])
  if (!currentOrganization) notFound()

  // Roles name people inside an application, and root registers none, so there
  // is no roles page for it rather than a permanently empty one.
  if (currentOrganization.isRoot) notFound()

  await requireOrganizationAdministration(currentOrganization.id, slug)

  // Roles are defined against applications, so the list is needed to say which
  // ones a role covers.
  const [applications, groups, result] = await Promise.all([
    getApplicationOptions(currentOrganization.id),
    getGroupOptions(currentOrganization.id),
    getApplicationRoles({
      organizationId: currentOrganization.id,
      search,
      clientIds: application,
      sort,
      direction,
      page: page + 1,
      pageSize: APPLICATION_ROLES_PAGE_SIZE,
    }),
  ])

  return (
    <>
      <AppHeader title={t("roles")} organization={currentOrganization} />
      <RolesPanel
        organizationId={currentOrganization.id}
        organizationSlug={currentOrganization.slug}
        applications={applications}
        groups={groups}
        result={result}
      />
    </>
  )
}
