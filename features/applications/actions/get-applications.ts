"use server"

import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm"

import { requireApplicationAdministration } from "@/features/applications/lib/application-read"
import {
  applicationTypeCount,
  applicationTypeFilter,
} from "@/features/applications/lib/application-type"
import { APPLICATIONS_PAGE_SIZE } from "@/features/applications/lib/applications-search-params"
import {
  APPLICATION_SORTS,
  APPLICATION_TYPES,
  type ApplicationRoleSummary,
  type ApplicationsQuery,
  type ApplicationsResult,
} from "@/features/applications/types"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  oauthClient,
} from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeLiteral,
  normalizeLiterals,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"

export async function getApplications(
  query: ApplicationsQuery
): Promise<ApplicationsResult> {
  const { organizationId } = query

  await requireApplicationAdministration(
    organizationId,
    "You cannot view these applications"
  )

  const search = normalizeSearch(query.search)
  const types = normalizeLiterals(query.types, APPLICATION_TYPES)
  const sort = normalizeLiteral(query.sort, APPLICATION_SORTS, "name")
  const sortDirection = query.direction === "desc" ? desc : asc
  const pageSize = normalizePageSize(query.pageSize, APPLICATIONS_PAGE_SIZE)

  // Scoped by the owning organization, never by anything the caller supplied
  // beyond the id already proven above. The client secret is never selected.
  const searchFilter = and(
    eq(oauthClient.referenceId, organizationId),
    search
      ? or(
          ilike(oauthClient.name, `%${search}%`),
          ilike(oauthClient.clientId, `%${search}%`)
        )
      : undefined
  )
  const resultFilter = and(searchFilter, applicationTypeFilter(types))

  const [[facets], [totalResult]] = await Promise.all([
    db
      .select({
        confidential: applicationTypeCount("confidential"),
        public: applicationTypeCount("public"),
      })
      .from(oauthClient)
      .where(searchFilter),
    db.select({ count: count() }).from(oauthClient).where(resultFilter),
  ])

  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)

  const rows = await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      redirectUris: oauthClient.redirectUris,
      postLogoutRedirectUris: oauthClient.postLogoutRedirectUris,
      uri: oauthClient.uri,
      icon: oauthClient.icon,
      skipConsent: oauthClient.skipConsent,
      disabled: oauthClient.disabled,
      tokenEndpointAuthMethod: oauthClient.tokenEndpointAuthMethod,
      createdAt: oauthClient.createdAt,
    })
    .from(oauthClient)
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
        .where(
          and(
            eq(applicationRole.organizationId, organizationId),
            inArray(applicationRoleClient.clientId, clientIds)
          )
        )
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
      postLogoutRedirectUris: row.postLogoutRedirectUris ?? [],
      uri: row.uri,
      icon: row.icon,
      skipConsent: row.skipConsent ?? false,
      disabled: row.disabled ?? false,
      isConfidential: row.tokenEndpointAuthMethod !== "none",
      createdAt: row.createdAt?.toISOString() ?? null,
      roles: rolesByClient.get(row.clientId) ?? [],
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
