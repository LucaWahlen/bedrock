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
  or,
  sql,
} from "drizzle-orm"

import {
  GROUP_MEMBER_PREVIEW,
  requireGroupAdministration,
} from "@/features/groups/lib/group-read"
import { GROUPS_PAGE_SIZE } from "@/features/groups/lib/groups-search-params"
import {
  GROUP_SORTS,
  type GroupMember,
  type GroupRoleSummary,
  type GroupsQuery,
  type GroupsResult,
} from "@/features/groups/types"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleGroup,
  group,
  groupMember,
  member,
  user,
} from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeIds,
  normalizeLiteral,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"

export async function getGroups(query: GroupsQuery): Promise<GroupsResult> {
  const { organizationId } = query

  await requireGroupAdministration(
    organizationId,
    "You cannot view these groups"
  )

  const search = normalizeSearch(query.search)
  const roleIds = normalizeIds(query.roleIds, 50)
  const sort = normalizeLiteral(query.sort, GROUP_SORTS, "name")
  const sortDirection = query.direction === "desc" ? desc : asc
  const pageSize = normalizePageSize(query.pageSize, GROUPS_PAGE_SIZE)

  const searchFilter = and(
    eq(group.organizationId, organizationId),
    search
      ? or(
          ilike(group.name, `%${search}%`),
          ilike(group.key, `%${search}%`),
          ilike(group.description, `%${search}%`)
        )
      : undefined
  )
  const resultFilter = and(
    searchFilter,
    roleIds.length
      ? exists(
          db
            .select({ one: sql`1` })
            .from(applicationRoleGroup)
            .where(
              and(
                eq(applicationRoleGroup.groupId, group.id),
                inArray(applicationRoleGroup.roleId, roleIds)
              )
            )
        )
      : undefined
  )

  const [facets, [totalResult]] = await Promise.all([
    // Counted over the search but not over the selection, so choosing one role
    // does not empty the others.
    db
      .select({
        roleId: applicationRoleGroup.roleId,
        count: countDistinct(group.id),
      })
      .from(applicationRoleGroup)
      .innerJoin(group, eq(group.id, applicationRoleGroup.groupId))
      .where(searchFilter)
      .groupBy(applicationRoleGroup.roleId),
    db.select({ count: count() }).from(group).where(resultFilter),
  ])

  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)

  const rows = await db
    .select({
      id: group.id,
      key: group.key,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      memberCount: countDistinct(groupMember.memberId),
    })
    .from(group)
    .leftJoin(groupMember, eq(groupMember.groupId, group.id))
    .where(resultFilter)
    .groupBy(group.id)
    .orderBy(
      sortDirection(sort === "createdAt" ? group.createdAt : group.name),
      asc(group.id)
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const groupIds = rows.map((row) => row.id)

  const [roleRows, memberRows] = groupIds.length
    ? await Promise.all([
        db
          .select({
            groupId: applicationRoleGroup.groupId,
            id: applicationRole.id,
            key: applicationRole.key,
            name: applicationRole.name,
          })
          .from(applicationRoleGroup)
          .innerJoin(
            applicationRole,
            eq(applicationRole.id, applicationRoleGroup.roleId)
          )
          .where(
            and(
              inArray(applicationRoleGroup.groupId, groupIds),
              eq(applicationRole.organizationId, organizationId)
            )
          )
          .orderBy(asc(applicationRole.name)),
        db
          .select({
            groupId: groupMember.groupId,
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          })
          .from(groupMember)
          .innerJoin(member, eq(member.id, groupMember.memberId))
          .innerJoin(user, eq(user.id, member.userId))
          .where(
            and(
              inArray(groupMember.groupId, groupIds),
              eq(member.organizationId, organizationId)
            )
          )
          .orderBy(asc(user.name)),
      ])
    : [[], []]

  const rolesByGroup = new Map<string, GroupRoleSummary[]>()
  for (const { groupId, ...role } of roleRows) {
    rolesByGroup.set(groupId, [...(rolesByGroup.get(groupId) ?? []), role])
  }

  const membersByGroup = new Map<string, GroupMember[]>()
  for (const { groupId, ...person } of memberRows) {
    membersByGroup.set(groupId, [
      ...(membersByGroup.get(groupId) ?? []),
      person,
    ])
  }

  return {
    groups: rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      memberCount: row.memberCount,
      memberPreview: (membersByGroup.get(row.id) ?? []).slice(
        0,
        GROUP_MEMBER_PREVIEW
      ),
      roles: rolesByGroup.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    roleCounts: Object.fromEntries(
      facets.map((facet) => [facet.roleId, facet.count])
    ),
  }
}
