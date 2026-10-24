import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AppHeader, requireOrganizationAdministration } from "@/features/app"
import {
  APPLICATIONS_PAGE_SIZE,
  ApplicationsPanel,
  getAllApplications,
  getApplications,
  getOidcConfiguration,
  InstanceApplicationsPanel,
  loadApplicationsSearchParams,
} from "@/features/applications"
import { getOrganizationBySlug } from "@/features/organizations"

type ApplicationsPageProps = PageProps<"/org/[slug]/applications">

export async function generateMetadata({
  params,
}: ApplicationsPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  return {
    title: currentOrganization
      ? `Applications | ${currentOrganization.name}`
      : "Applications",
  }
}

export default async function ApplicationsPage({
  params,
  searchParams,
}: ApplicationsPageProps) {
  const [{ slug }, { search, type, sort, direction, page }] = await Promise.all(
    [params, loadApplicationsSearchParams(searchParams)]
  )
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  await requireOrganizationAdministration(currentOrganization.id, slug)

  const configuration = await getOidcConfiguration()
  const query = {
    search,
    types: type,
    sort,
    direction,
    page: page + 1,
    pageSize: APPLICATIONS_PAGE_SIZE,
  }

  // Root registers nothing of its own, so its page is the instance's list
  // rather than an empty one. `getAllApplications` rechecks root administration
  // itself; reaching this branch is not what authorizes it.
  if (currentOrganization.isRoot) {
    return (
      <>
        <AppHeader title="Applications" organization={currentOrganization} />
        <InstanceApplicationsPanel
          result={await getAllApplications(query)}
          configuration={configuration}
        />
      </>
    )
  }

  const result = await getApplications({
    ...query,
    organizationId: currentOrganization.id,
  })

  return (
    <>
      <AppHeader title="Applications" organization={currentOrganization} />
      <ApplicationsPanel
        organizationId={currentOrganization.id}
        result={result}
        configuration={configuration}
      />
    </>
  )
}
