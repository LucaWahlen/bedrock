"use server"

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { memberAdministers, requireRootAdministration } from "@/features/auth"
import { ORGANIZATIONS_PAGE_SIZE } from "@/features/organizations/lib/organizations-search-params"
import {
  ORGANIZATION_SORTS,
  ORGANIZATION_STATUSES,
  type OrganizationPerson,
  type OrganizationsQuery,
  type OrganizationsResult,
  type OrganizationStatus,
} from "@/features/organizations/types"
import { organizationPurgeDate } from "@/features/organizations/utils/organization-retention"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { member, organization, user } from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeLiteral,
  normalizeLiterals,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"

const PEOPLE_PREVIEW_LIMIT = 3

// Both counts come off the one join, so an organization is read once.
function peopleCount(administers: boolean) {
  return sql<number>`count(${member.id}) filter (where ${memberAdministers(member.role, administers)})`.mapWith(
    Number
  )
}

function rankedPeople(subqueryName: string, roleFilter?: SQL) {
  return db
    .select({
      organizationId: member.organizationId,
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      rank: sql<number>`row_number() over (partition by ${member.organizationId} order by ${user.name}, ${user.id})`.as(
        "rank"
      ),
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(roleFilter)
    .as(subqueryName)
}

function selectPreview(
  ranked: ReturnType<typeof rankedPeople>,
  organizationIds: string[]
) {
  return db
    .select({
      organizationId: ranked.organizationId,
      id: ranked.id,
      name: ranked.name,
      email: ranked.email,
      image: ranked.image,
    })
    .from(ranked)
    .where(
      and(
        inArray(ranked.organizationId, organizationIds),
        lte(ranked.rank, PEOPLE_PREVIEW_LIMIT)
      )
    )
    .orderBy(asc(ranked.organizationId), asc(ranked.name))
}

function groupByOrganization(
  rows: (OrganizationPerson & { organizationId: string })[]
) {
  const grouped = new Map<string, OrganizationPerson[]>()

  for (const { organizationId, ...person } of rows) {
    const people = grouped.get(organizationId)
    if (people) people.push(person)
    else grouped.set(organizationId, [person])
  }

  return grouped
}

export async function getOrganizations(
  query: OrganizationsQuery = {}
): Promise<OrganizationsResult> {
  await requireRootAdministration("You cannot view organizations")

  const search = normalizeSearch(query.search)
  const statuses = normalizeLiterals(query.statuses, ORGANIZATION_STATUSES)
  const sort = normalizeLiteral(query.sort, ORGANIZATION_SORTS, "name")
  const direction = query.direction === "desc" ? "desc" : "asc"
  const pageSize = normalizePageSize(query.pageSize, ORGANIZATIONS_PAGE_SIZE)
  const searchFilter = search
    ? or(
        ilike(organization.name, `%${search}%`),
        ilike(organization.slug, `%${search}%`)
      )
    : undefined
  const statusFilter = statuses.length
    ? inArray(organization.status, statuses)
    : undefined
  const resultFilter = and(searchFilter, statusFilter)

  const [[totalResult], statusFacets] = await Promise.all([
    db.select({ count: count() }).from(organization).where(resultFilter),
    db
      .select({ status: organization.status, count: count() })
      .from(organization)
      .where(searchFilter)
      .groupBy(organization.status),
  ])
  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)
  const sortColumn =
    sort === "createdAt" ? organization.createdAt : organization.name
  const sortDirection = direction === "desc" ? desc : asc
  const statusCounts: Record<OrganizationStatus, number> = {
    active: 0,
    suspended: 0,
    deleted: 0,
  }
  for (const facet of statusFacets) statusCounts[facet.status] = facet.count

  const statusActor = alias(user, "status_actor")
  const organizations = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      isRoot: organization.isRoot,
      status: organization.status,
      createdAt: organization.createdAt,
      statusChangedAt: organization.statusChangedAt,
      statusChangedBy: statusActor.name,
      deletedAt: organization.deletedAt,
      administratorCount: peopleCount(true),
      memberCount: peopleCount(false),
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .leftJoin(statusActor, eq(statusActor.id, organization.statusChangedBy))
    .where(resultFilter)
    .groupBy(organization.id, statusActor.name)
    .orderBy(sortDirection(sortColumn), asc(organization.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const organizationIds = organizations.map(
    (currentOrganization) => currentOrganization.id
  )
  if (organizationIds.length === 0) {
    return { organizations: [], total, page, pageSize, statusCounts }
  }

  const [administratorPreviews, memberPreviews] = await Promise.all([
    selectPreview(
      rankedPeople("ranked_administrators", memberAdministers(member.role)),
      organizationIds
    ),
    selectPreview(
      rankedPeople("ranked_members", memberAdministers(member.role, false)),
      organizationIds
    ),
  ])

  const administratorsByOrganization = groupByOrganization(
    administratorPreviews
  )
  const membersByOrganization = groupByOrganization(memberPreviews)

  return {
    organizations: organizations.map(
      ({
        deletedAt,
        statusChangedAt,
        statusChangedBy,
        ...currentOrganization
      }) => ({
        ...currentOrganization,
        createdAt: currentOrganization.createdAt.toISOString(),
        purgeScheduledFor: deletedAt
          ? organizationPurgeDate(
              deletedAt,
              env.housekeeping.organizationRetentionDays
            ).toISOString()
          : null,
        lastStatusChange: statusChangedAt
          ? {
              actorName: statusChangedBy,
              changedAt: statusChangedAt.toISOString(),
            }
          : null,
        administratorPreview:
          administratorsByOrganization.get(currentOrganization.id) ?? [],
        memberPreview: membersByOrganization.get(currentOrganization.id) ?? [],
      })
    ),
    total,
    page,
    pageSize,
    statusCounts,
  }
}
