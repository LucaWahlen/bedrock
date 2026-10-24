import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { AppHeader } from "@/features/app"
import {
  DIRECTORY_PAGE_SIZE,
  DirectoryTable,
  getDirectory,
  getOrganizationBySlug,
  loadDirectorySearchParams,
} from "@/features/organizations"

type DirectoryPageProps = PageProps<"/org/[slug]/directory">

export async function generateMetadata({
  params,
}: DirectoryPageProps): Promise<Metadata> {
  const { slug } = await params
  const [t, currentOrganization] = await Promise.all([
    getTranslations("organizations.pages"),
    getOrganizationBySlug(slug),
  ])

  return {
    title: currentOrganization
      ? t("titleWithOrganization", {
          page: t("directory"),
          organization: currentOrganization.name,
        })
      : t("directory"),
  }
}

export default async function DirectoryPage({
  params,
  searchParams,
}: DirectoryPageProps) {
  const [{ slug }, { search, organization, account, sort, direction, page }] =
    await Promise.all([params, loadDirectorySearchParams(searchParams)])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization?.isRoot) notFound()

  const result = await getDirectory({
    search,
    organizationIds: organization,
    statuses: account,
    sort,
    direction,
    page: page + 1,
    pageSize: DIRECTORY_PAGE_SIZE,
  })

  const t = await getTranslations("organizations.pages")

  return (
    <>
      <AppHeader title={t("directory")} organization={currentOrganization} />
      <DirectoryTable result={result} />
    </>
  )
}
