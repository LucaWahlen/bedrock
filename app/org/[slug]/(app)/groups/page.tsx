import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AppHeader, requireOrganizationAdministration } from "@/features/app"
import { getApplicationRoleOptions } from "@/features/applications"
import {
  getGroups,
  GROUPS_PAGE_SIZE,
  GroupsPanel,
  loadGroupsSearchParams,
} from "@/features/groups"
import { getOrganizationBySlug } from "@/features/organizations"

type GroupsPageProps = PageProps<"/org/[slug]/groups">

export async function generateMetadata({
  params,
}: GroupsPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  return {
    title: currentOrganization
      ? `Groups | ${currentOrganization.name}`
      : "Groups",
  }
}

export default async function GroupsPage({
  params,
  searchParams,
}: GroupsPageProps) {
  const [{ slug }, { search, role, sort, direction, page }] = await Promise.all(
    [params, loadGroupsSearchParams(searchParams)]
  )
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  // Groups exist to grant application roles, and root owns no applications.
  if (currentOrganization.isRoot) notFound()

  await requireOrganizationAdministration(currentOrganization.id, slug)

  const [roles, result] = await Promise.all([
    getApplicationRoleOptions(currentOrganization.id),
    getGroups({
      organizationId: currentOrganization.id,
      search,
      roleIds: role,
      sort,
      direction,
      page: page + 1,
      pageSize: GROUPS_PAGE_SIZE,
    }),
  ])

  return (
    <>
      <AppHeader title="Groups" organization={currentOrganization} />
      <GroupsPanel
        organizationId={currentOrganization.id}
        roles={roles}
        result={result}
      />
    </>
  )
}
