import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { StatusPage } from "@/features/app"
import { getRootOrganization } from "@/features/organizations"

export async function generateMetadata(): Promise<Metadata> {
  const rootOrganization = await getRootOrganization()

  return {
    title: rootOrganization ? `404 | ${rootOrganization.name}` : "404",
  }
}

export default async function OrganizationNotFound() {
  const [t, rootOrganization] = await Promise.all([
    getTranslations(),
    getRootOrganization(),
  ])

  return (
    <StatusPage
      organization={rootOrganization}
      code="404"
      title={t("app.status.organizationNotFound.title")}
      description={t("app.status.organizationNotFound.description")}
      action={{ href: "/", label: t("common.actions.goHome") }}
    />
  )
}
