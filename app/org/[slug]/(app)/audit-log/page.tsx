import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { AppHeader } from "@/features/app"
import {
  AUDIT_EVENTS_PAGE_SIZE,
  AuditLogTable,
  getAuditLogAccess,
  listAuditEvents,
  loadAuditLogSearchParams,
} from "@/features/audit"
import {
  getOrganizationBySlug,
  getRootOrganization,
} from "@/features/organizations"

type AuditLogPageProps = PageProps<"/org/[slug]/audit-log">

export async function generateMetadata({
  params,
}: AuditLogPageProps): Promise<Metadata> {
  const { slug } = await params
  const [currentOrganization, t] = await Promise.all([
    getOrganizationBySlug(slug),
    getTranslations("app.navigation.items"),
  ])

  return {
    title: currentOrganization
      ? `${t("auditLog")} | ${currentOrganization.name}`
      : t("auditLog"),
  }
}

export default async function AuditLogPage({
  params,
  searchParams,
}: AuditLogPageProps) {
  const [
    { slug },
    { search, action, outcome, actor, organization, direction, page },
  ] = await Promise.all([params, loadAuditLogSearchParams(searchParams)])
  const currentOrganization = await getOrganizationBySlug(slug)
  if (!currentOrganization) notFound()

  // Undefined selects the instance log: platform events, not just root's own.
  const organizationId = currentOrganization.isRoot
    ? undefined
    : currentOrganization.id
  const access = await getAuditLogAccess(organizationId)
  if (!access.canView) redirect(`/org/${slug}/forbidden`)

  const result = await listAuditEvents({
    organizationId,
    search,
    actions: action,
    outcomes: outcome,
    actorIds: actor,
    organizationIds: organization,
    direction,
    page: page + 1,
    pageSize: AUDIT_EVENTS_PAGE_SIZE,
  })
  const rootOrganization = currentOrganization.isRoot
    ? currentOrganization
    : await getRootOrganization()
  if (!rootOrganization) notFound()
  const t = await getTranslations("app.navigation.items")

  return (
    <>
      <AppHeader title={t("auditLog")} organization={currentOrganization} />
      <AuditLogTable
        result={result}
        showOrganization={currentOrganization.isRoot}
        rootOrganization={rootOrganization}
      />
    </>
  )
}
