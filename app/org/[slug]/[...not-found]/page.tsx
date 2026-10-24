import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound } from "next/navigation"

import { StatusPage } from "@/features/app"
import {
  getOrganizationBySlug,
  getRootOrganization,
} from "@/features/organizations"

type OrganizationCatchAllNotFoundPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: OrganizationCatchAllNotFoundPageProps): Promise<Metadata> {
  const { slug } = await params
  const organization = await getOrganizationBySlug(slug)
  const rootOrganization = organization
    ? undefined
    : await getRootOrganization()
  const organizationName = organization?.name ?? rootOrganization?.name

  return {
    title: organizationName ? `404 | ${organizationName}` : "404",
  }
}

export default async function OrganizationCatchAllNotFoundPage({
  params,
}: OrganizationCatchAllNotFoundPageProps) {
  const { slug } = await params
  const organization = await getOrganizationBySlug(slug)

  if (!organization) {
    notFound()
  }

  const t = await getTranslations()

  return (
    <StatusPage
      organization={organization}
      code="404"
      title={t("app.status.pageNotFound.title")}
      description={t("app.status.pageNotFound.description")}
      action={{ href: `/org/${slug}`, label: t("common.actions.goHome") }}
    />
  )
}
