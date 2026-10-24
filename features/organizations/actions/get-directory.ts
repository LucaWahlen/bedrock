"use server"

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm"

import { requireRootAdministration, splitRoles } from "@/features/auth"
import { DIRECTORY_PAGE_SIZE } from "@/features/organizations/lib/people-search-params"
import {
  ACCOUNT_STATUSES,
  PEOPLE_SORTS,
  type AccountStatus,
  type DirectoryQuery,
  type DirectoryResult,
  type Membership,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { member, organization, user } from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeIds,
  normalizeLiteral,
  normalizeLiterals,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"

const MEMBERSHIP_PREVIEW_LIMIT = 3

const MAX_FACET_OPTIONS = 50

function statusFilter(status: AccountStatus) {
  return status === "disabled"
    ? isNotNull(user.disabledAt)
    : isNull(user.disabledAt)
}

// Every account on the instance, which only a root administrator may read. A
// tenant sees its own members instead, and never the rest of the directory.
export async function getDirectory(
  query: DirectoryQuery = {}
): Promise<DirectoryResult> {
  const access = await requireRootAdministration(
    "You cannot view the directory"
  )

  const search = normalizeSearch(query.search)
  const organizationIds = normalizeIds(query.organizationIds, MAX_FACET_OPTIONS)
  const statuses = normalizeLiterals(query.statuses, ACCOUNT_STATUSES)
  const sort = normalizeLiteral(query.sort, PEOPLE_SORTS, "name")
  const direction = query.direction === "desc" ? "desc" : "asc"
  const pageSize = normalizePageSize(query.pageSize, DIRECTORY_PAGE_SIZE)
  const searchFilter = search
    ? or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))
    : undefined
  const resultFilter = and(
    searchFilter,
    statuses.length ? or(...statuses.map(statusFilter)) : undefined,
    organizationIds.length
      ? inArray(
          user.id,
          db
            .select({ userId: member.userId })
            .from(member)
            .where(inArray(member.organizationId, organizationIds))
        )
      : undefined
  )

  const [[totalResult], organizationFacets, [statusCounts]] = await Promise.all(
    [
      db.select({ count: count() }).from(user).where(resultFilter),
      // Counted over the search but not over the organization selection, so
      // choosing one organization does not empty the others.
      db
        .select({
          value: organization.id,
          label: organization.name,
          description: organization.slug,
          image: organization.logo,
          count: count(member.userId),
        })
        .from(organization)
        .innerJoin(member, eq(member.organizationId, organization.id))
        .innerJoin(user, eq(user.id, member.userId))
        .where(searchFilter)
        .groupBy(
          organization.id,
          organization.name,
          organization.slug,
          organization.logo
        )
        .orderBy(desc(count(member.userId)), asc(organization.name))
        .limit(MAX_FACET_OPTIONS),
      // Over the search alone, like the organization facet.
      db
        .select({
          active:
            sql<number>`count(*) filter (where ${user.disabledAt} is null)`.mapWith(
              Number
            ),
          disabled:
            sql<number>`count(*) filter (where ${user.disabledAt} is not null)`.mapWith(
              Number
            ),
        })
        .from(user)
        .where(searchFilter),
    ]
  )
  const accountCounts = {
    active: statusCounts?.active ?? 0,
    disabled: statusCounts?.disabled ?? 0,
  }

  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)
  const sortColumn = sort === "createdAt" ? user.createdAt : user.name
  const sortDirection = direction === "desc" ? desc : asc
  // Never active is an absence rather than an extreme, so it stays out of the
  // way at either end.
  const orderBy =
    sort === "lastActiveAt"
      ? sql`${user.lastActiveAt} ${sql.raw(direction)} nulls last`
      : sortDirection(sortColumn)

  const people = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      disabledAt: user.disabledAt,
      disabledReason: user.disabledReason,
      organizationCount: count(member.id),
    })
    .from(user)
    .leftJoin(member, eq(member.userId, user.id))
    .where(resultFilter)
    .groupBy(user.id)
    .orderBy(orderBy, asc(user.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const userIds = people.map((person) => person.id)
  if (userIds.length === 0) {
    return {
      people: [],
      total,
      page,
      pageSize,
      organizationFacets,
      statusCounts: accountCounts,
    }
  }

  const ranked = db
    .select({
      userId: member.userId,
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      isRoot: organization.isRoot,
      role: member.role,
      joinedAt: member.createdAt,
      rank: sql<number>`row_number() over (partition by ${member.userId} order by ${organization.name}, ${organization.id})`.as(
        "rank"
      ),
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    // Ranking only this page's accounts keeps the window off every membership
    // on the instance.
    .where(inArray(member.userId, userIds))
    .as("ranked_memberships")

  const previewRows = await db
    .select({
      userId: ranked.userId,
      organizationId: ranked.organizationId,
      name: ranked.name,
      slug: ranked.slug,
      logo: ranked.logo,
      isRoot: ranked.isRoot,
      role: ranked.role,
      joinedAt: ranked.joinedAt,
    })
    .from(ranked)
    .where(lte(ranked.rank, MEMBERSHIP_PREVIEW_LIMIT))
    .orderBy(asc(ranked.userId), asc(ranked.name))

  const previewByUser = new Map<string, Membership[]>()
  for (const row of previewRows) {
    const membership: Membership = {
      organizationId: row.organizationId,
      name: row.name,
      slug: row.slug,
      logo: row.logo,
      isRoot: row.isRoot,
      roles: splitRoles(row.role),
      joinedAt: row.joinedAt.toISOString(),
    }
    const existing = previewByUser.get(row.userId)
    if (existing) existing.push(membership)
    else previewByUser.set(row.userId, [membership])
  }

  return {
    people: people.map(({ disabledAt, disabledReason, ...person }) => ({
      ...person,
      createdAt: person.createdAt.toISOString(),
      lastActiveAt: person.lastActiveAt?.toISOString() ?? null,
      organizationPreview: previewByUser.get(person.id) ?? [],
      disabled: disabledAt
        ? { at: disabledAt.toISOString(), reason: disabledReason }
        : null,
      isSelf: person.id === access.user?.id,
    })),
    total,
    page,
    pageSize,
    organizationFacets,
    statusCounts: accountCounts,
  }
}
