"use server"

import { and, asc, countDistinct, eq, inArray } from "drizzle-orm"

import { requireGroupAdministration } from "@/features/groups/lib/group-read"
import type { GroupOption, GroupRoleSummary } from "@/features/groups/types"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleGroup,
  group,
  groupMember,
} from "@/features/shared/lib/db/schema"

// Every group of an organization, for pickers and filters.
export async function getGroupOptions(
  organizationId: string
): Promise<GroupOption[]> {
  await requireGroupAdministration(
    organizationId,
    "You cannot view these groups"
  )

  const groups = await db
    .select({
      id: group.id,
      key: group.key,
      name: group.name,
      description: group.description,
      memberCount: countDistinct(groupMember.memberId),
    })
    .from(group)
    .leftJoin(groupMember, eq(groupMember.groupId, group.id))
    .where(eq(group.organizationId, organizationId))
    .groupBy(group.id)
    .orderBy(asc(group.name))

  const grants = groups.length
    ? await db
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
            eq(applicationRoleGroup.organizationId, organizationId),
            inArray(
              applicationRoleGroup.groupId,
              groups.map((option) => option.id)
            )
          )
        )
        .orderBy(asc(applicationRole.name))
    : []

  const rolesByGroup = new Map<string, GroupRoleSummary[]>()
  for (const { groupId, ...role } of grants) {
    rolesByGroup.set(groupId, [...(rolesByGroup.get(groupId) ?? []), role])
  }

  return groups.map((option) => ({
    ...option,
    roles: rolesByGroup.get(option.id) ?? [],
  }))
}
