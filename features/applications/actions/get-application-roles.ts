"use server"

import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm"

import {
  requireApplicationAdministration,
  ROLE_MEMBER_PREVIEW,
} from "@/features/applications/lib/application-read"
import { APPLICATION_ROLES_PAGE_SIZE } from "@/features/applications/lib/applications-search-params"
import {
  APPLICATION_ROLE_SORTS,
  type ApplicationRolesQuery,
  type ApplicationRolesResult,
  type ApplicationSummary,
  type RoleGroupSummary,
  type RoleMember,
} from "@/features/applications/types"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  applicationRoleGroup,
  group,
  member,
  oauthClient,
  user,
} from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeIds,
  normalizeLiteral,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"
import { roleGrantsIn } from "@/features/shared/lib/role-grants"

// The first few holders of each role, ranked in the database so a role held by
// thousands still sends only its preview.
function previewHolders(
  grants: ReturnType<typeof roleGrantsIn>,
  organizationId: string,
  roleIds: string[]
) {
  const holders = db
    .selectDistinct({
      roleId: grants.roleId,
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(grants)
    .innerJoin(member, eq(member.id, grants.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        inArray(grants.roleId, roleIds),
        eq(member.organizationId, organizationId)
      )
    )
    .as("holder")
  const ranked = db
    .select({
      roleId: holders.roleId,
      id: holders.id,
      name: holders.name,
      email: holders.email,
      image: holders.image,
      rank: sql<number>`row_number() over (partition by ${holders.roleId} order by ${holders.name}, ${holders.id})`.as(
        "rank"
      ),
    })
    .from(holders)
    .as("ranked")

  return db
    .select({
      roleId: ranked.roleId,
      id: ranked.id,
      name: ranked.name,
      email: ranked.email,
      image: ranked.image,
    })
    .from(ranked)
    .where(lte(ranked.rank, ROLE_MEMBER_PREVIEW))
    .orderBy(asc(ranked.name), asc(ranked.id))
}

export async function getApplicationRoles(
  query: ApplicationRolesQuery
): Promise<ApplicationRolesResult> {
  const { organizationId } = query

  await requireApplicationAdministration(
    organizationId,
    "You cannot view these roles"
  )

  const search = normalizeSearch(query.search)
  const clientIds = normalizeIds(query.clientIds, 50)
  const sort = normalizeLiteral(query.sort, APPLICATION_ROLE_SORTS, "name")
  const sortDirection = query.direction === "desc" ? desc : asc
  const pageSize = normalizePageSize(
    query.pageSize,
    APPLICATION_ROLES_PAGE_SIZE
  )

  const searchFilter = and(
    eq(applicationRole.organizationId, organizationId),
    search
      ? or(
          ilike(applicationRole.name, `%${search}%`),
          ilike(applicationRole.key, `%${search}%`),
          ilike(applicationRole.description, `%${search}%`)
        )
      : undefined
  )
  const resultFilter = and(
    searchFilter,
    clientIds.length
      ? exists(
          db
            .select({ one: sql`1` })
            .from(applicationRoleClient)
            .where(
              and(
                eq(applicationRoleClient.roleId, applicationRole.id),
                inArray(applicationRoleClient.clientId, clientIds)
              )
            )
        )
      : undefined
  )

  const [facets, [totalResult]] = await Promise.all([
    // Counted over the search but not over the selection, so choosing one
    // application does not empty the others.
    db
      .select({
        clientId: applicationRoleClient.clientId,
        count: countDistinct(applicationRole.id),
      })
      .from(applicationRoleClient)
      .innerJoin(
        applicationRole,
        eq(applicationRole.id, applicationRoleClient.roleId)
      )
      .where(searchFilter)
      .groupBy(applicationRoleClient.clientId),
    db.select({ count: count() }).from(applicationRole).where(resultFilter),
  ])

  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)
  // Everyone holding a role, directly or through a group, is counted and shown
  // as a member of it, since that is who an application receives it for.
  const grants = roleGrantsIn(organizationId)

  const rows = await db
    .select({
      id: applicationRole.id,
      key: applicationRole.key,
      name: applicationRole.name,
      description: applicationRole.description,
      createdAt: applicationRole.createdAt,
      memberCount: countDistinct(grants.memberId),
      directMemberCount:
        sql<number>`count(distinct ${grants.memberId}) filter (where ${grants.groupId} is null)`.mapWith(
          Number
        ),
      groupMemberCount:
        sql<number>`count(distinct ${grants.memberId}) filter (where ${grants.groupId} is not null)`.mapWith(
          Number
        ),
    })
    .from(applicationRole)
    .leftJoin(grants, eq(grants.roleId, applicationRole.id))
    .where(resultFilter)
    .groupBy(applicationRole.id)
    .orderBy(
      sortDirection(
        sort === "createdAt" ? applicationRole.createdAt : applicationRole.name
      ),
      asc(applicationRole.id)
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const roleIds = rows.map((row) => row.id)

  const [applicationRows, memberRows, groupRows] = roleIds.length
    ? await Promise.all([
        db
          .select({
            roleId: applicationRoleClient.roleId,
            clientId: oauthClient.clientId,
            name: oauthClient.name,
            icon: oauthClient.icon,
          })
          .from(applicationRoleClient)
          .innerJoin(
            oauthClient,
            eq(oauthClient.clientId, applicationRoleClient.clientId)
          )
          .where(inArray(applicationRoleClient.roleId, roleIds))
          .orderBy(asc(oauthClient.name)),
        previewHolders(grants, organizationId, roleIds),
        db
          .select({
            roleId: applicationRoleGroup.roleId,
            id: group.id,
            key: group.key,
            name: group.name,
          })
          .from(applicationRoleGroup)
          .innerJoin(group, eq(group.id, applicationRoleGroup.groupId))
          .where(
            and(
              inArray(applicationRoleGroup.roleId, roleIds),
              eq(group.organizationId, organizationId)
            )
          )
          .orderBy(asc(group.name)),
      ])
    : [[], [], []]

  const applicationsByRole = new Map<string, ApplicationSummary[]>()
  for (const { roleId, clientId, name, icon } of applicationRows) {
    applicationsByRole.set(roleId, [
      ...(applicationsByRole.get(roleId) ?? []),
      { clientId, name: name ?? clientId, icon },
    ])
  }

  const membersByRole = new Map<string, RoleMember[]>()
  for (const { roleId, ...person } of memberRows) {
    membersByRole.set(roleId, [...(membersByRole.get(roleId) ?? []), person])
  }

  const groupsByRole = new Map<string, RoleGroupSummary[]>()
  for (const { roleId, ...granting } of groupRows) {
    groupsByRole.set(roleId, [...(groupsByRole.get(roleId) ?? []), granting])
  }

  return {
    roles: rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      applications: applicationsByRole.get(row.id) ?? [],
      memberCount: row.memberCount,
      directMemberCount: row.directMemberCount,
      groupMemberCount: row.groupMemberCount,
      memberPreview: membersByRole.get(row.id) ?? [],
      groups: groupsByRole.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    applicationCounts: Object.fromEntries(
      facets.map((facet) => [facet.clientId, facet.count])
    ),
  }
}
