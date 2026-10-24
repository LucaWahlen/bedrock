import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { AppHeader, requireOrganizationAdministration } from "@/features/app"
import { getApplicationRoleOptions } from "@/features/applications"
import { getGroupOptions } from "@/features/groups"
import {
  getOrganizationBySlug,
  getOrganizationMembers,
  loadMembersSearchParams,
  MEMBERS_PAGE_SIZE,
  MembersTable,
} from "@/features/organizations"

type MembersPageProps = PageProps<"/org/[slug]/members">

export async function generateMetadata({
  params,
}: MembersPageProps): Promise<Metadata> {
  const { slug } = await params
  const [t, currentOrganization] = await Promise.all([
    getTranslations("organizations.pages"),
    getOrganizationBySlug(slug),
  ])

  return {
    title: currentOrganization
      ? t("titleWithOrganization", {
          page: t("members"),
          organization: currentOrganization.name,
        })
      : t("members"),
  }
}

export default async function MembersPage({
  params,
  searchParams,
}: MembersPageProps) {
  const [
    { slug },
    { search, role, status, applicationRole, group, sort, direction, page },
  ] = await Promise.all([params, loadMembersSearchParams(searchParams)])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  await requireOrganizationAdministration(currentOrganization.id, slug)

  const [result, applicationRoles, groups] = await Promise.all([
    getOrganizationMembers({
      organizationId: currentOrganization.id,
      search,
      roles: role,
      statuses: status,
      applicationRoleIds: applicationRole,
      groupIds: group,
      sort,
      direction,
      page: page + 1,
      pageSize: MEMBERS_PAGE_SIZE,
    }),
    // The root organization owns no applications, so it has no roles to offer.
    currentOrganization.isRoot
      ? []
      : getApplicationRoleOptions(currentOrganization.id),
    // Groups exist to grant those roles, so root has none either.
    currentOrganization.isRoot ? [] : getGroupOptions(currentOrganization.id),
  ])

  const t = await getTranslations("organizations.pages")

  return (
    <>
      <AppHeader title={t("members")} organization={currentOrganization} />
      <MembersTable
        organization={currentOrganization}
        result={result}
        applicationRoles={applicationRoles}
        groups={groups}
      />
    </>
  )
}
