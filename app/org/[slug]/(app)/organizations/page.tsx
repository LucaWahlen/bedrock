import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { AppHeader } from "@/features/app"
import {
  getOrganizationBySlug,
  getOrganizations,
  loadOrganizationsSearchParams,
  ORGANIZATIONS_PAGE_SIZE,
  OrganizationsTable,
} from "@/features/organizations"

type OrganizationsPageProps = PageProps<"/org/[slug]/organizations">

export async function generateMetadata({
  params,
}: OrganizationsPageProps): Promise<Metadata> {
  const { slug } = await params
  const [t, currentOrganization] = await Promise.all([
    getTranslations("organizations.pages"),
    getOrganizationBySlug(slug),
  ])

  return {
    title: currentOrganization
      ? t("titleWithOrganization", {
          page: t("organizations"),
          organization: currentOrganization.name,
        })
      : t("organizations"),
  }
}

export default async function OrganizationsPage({
  params,
  searchParams,
}: OrganizationsPageProps) {
  const [{ slug }, { search, status, sort, direction, page }] =
    await Promise.all([params, loadOrganizationsSearchParams(searchParams)])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization?.isRoot) notFound()

  const result = await getOrganizations({
    search,
    statuses: status,
    sort,
    direction,
    page: page + 1,
    pageSize: ORGANIZATIONS_PAGE_SIZE,
  })

  const t = await getTranslations("organizations.pages")

  return (
    <>
      <AppHeader
        title={t("organizations")}
        organization={currentOrganization}
      />
      <OrganizationsTable result={result} />
    </>
  )
}
