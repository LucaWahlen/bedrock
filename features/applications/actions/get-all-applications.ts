"use server"

import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm"

import {
  applicationTypeCount,
  applicationTypeFilter,
} from "@/features/applications/lib/application-type"
import { APPLICATIONS_PAGE_SIZE } from "@/features/applications/lib/applications-search-params"
import {
  APPLICATION_SORTS,
  APPLICATION_TYPES,
  type ApplicationRoleSummary,
  type InstanceApplicationsQuery,
  type InstanceApplicationsResult,
} from "@/features/applications/types"
import { requireRootAdministration } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  oauthClient,
  organization,
} from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeLiteral,
  normalizeLiterals,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"

// Every application on the instance, for the root organization's own page.
// Reading is all it grants: root administration is not membership of a tenant,
// so nothing here may be edited from that page.
export async function getAllApplications(
  query: InstanceApplicationsQuery
): Promise<InstanceApplicationsResult> {
  await requireRootAdministration("You cannot view instance applications")

  const search = normalizeSearch(query.search)
  const types = normalizeLiterals(query.types, APPLICATION_TYPES)
  const sort = normalizeLiteral(query.sort, APPLICATION_SORTS, "name")
  const sortDirection = query.direction === "desc" ? desc : asc
  const pageSize = normalizePageSize(query.pageSize, APPLICATIONS_PAGE_SIZE)

  const searchFilter = search
    ? or(
        ilike(oauthClient.name, `%${search}%`),
        ilike(oauthClient.clientId, `%${search}%`),
        ilike(organization.name, `%${search}%`)
      )
    : undefined
  const resultFilter = and(searchFilter, applicationTypeFilter(types))

  const [[facets], [totalResult]] = await Promise.all([
    db
      .select({
        confidential: applicationTypeCount("confidential"),
        public: applicationTypeCount("public"),
      })
      .from(oauthClient)
      .innerJoin(organization, eq(organization.id, oauthClient.referenceId))
      .where(searchFilter),
    db
      .select({ count: count() })
      .from(oauthClient)
      .innerJoin(organization, eq(organization.id, oauthClient.referenceId))
      .where(resultFilter),
  ])

  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)

  const rows = await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      redirectUris: oauthClient.redirectUris,
      uri: oauthClient.uri,
      icon: oauthClient.icon,
      skipConsent: oauthClient.skipConsent,
      disabled: oauthClient.disabled,
      tokenEndpointAuthMethod: oauthClient.tokenEndpointAuthMethod,
      createdAt: oauthClient.createdAt,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      organizationLogo: organization.logo,
    })
    .from(oauthClient)
    .innerJoin(organization, eq(organization.id, oauthClient.referenceId))
    .where(resultFilter)
    .orderBy(
      sortDirection(
        sort === "createdAt" ? oauthClient.createdAt : oauthClient.name
      ),
      asc(oauthClient.clientId)
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const clientIds = rows.map((row) => row.clientId)
  const roleRows = clientIds.length
    ? await db
        .select({
          clientId: applicationRoleClient.clientId,
          id: applicationRole.id,
          key: applicationRole.key,
          name: applicationRole.name,
        })
        .from(applicationRoleClient)
        .innerJoin(
          applicationRole,
          eq(applicationRole.id, applicationRoleClient.roleId)
        )
        .where(inArray(applicationRoleClient.clientId, clientIds))
        .orderBy(asc(applicationRole.name))
    : []

  const rolesByClient = new Map<string, ApplicationRoleSummary[]>()
  for (const { clientId, ...role } of roleRows) {
    rolesByClient.set(clientId, [...(rolesByClient.get(clientId) ?? []), role])
  }

  return {
    applications: rows.map((row) => ({
      clientId: row.clientId,
      name: row.name ?? row.clientId,
      redirectUris: row.redirectUris ?? [],
      uri: row.uri,
      icon: row.icon,
      skipConsent: row.skipConsent ?? false,
      disabled: row.disabled ?? false,
      isConfidential: row.tokenEndpointAuthMethod !== "none",
      createdAt: row.createdAt?.toISOString() ?? null,
      roles: rolesByClient.get(row.clientId) ?? [],
      organization: {
        id: row.organizationId,
        name: row.organizationName,
        slug: row.organizationSlug,
        logo: row.organizationLogo,
      },
    })),
    total,
    page,
    pageSize,
    typeCounts: {
      confidential: facets?.confidential ?? 0,
      public: facets?.public ?? 0,
    },
  }
}
