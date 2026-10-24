"use server"

import { and, asc, eq, sql } from "drizzle-orm"

import { requireApplicationAdministration } from "@/features/applications/lib/application-read"
import type {
  RoleGroupSummary,
  RoleHolder,
} from "@/features/applications/types"
import { db } from "@/features/shared/lib/db/client"
import { group, member, user } from "@/features/shared/lib/db/schema"
import { roleGrantsIn } from "@/features/shared/lib/role-grants"
import type { QueryResult } from "@/features/shared/types"

const MAX_MEMBERS = 200

// Everyone who holds one role, and how: directly, through groups, or both.
// roleId is a query target, not a claimed identity: the organization is proved
// first, and the role is then matched inside it, so another organization's
// role holds nobody here.
export async function getRoleMembers(
  organizationId: string,
  roleId: string
): Promise<QueryResult<RoleHolder[]>> {
  try {
    await requireApplicationAdministration(
      organizationId,
      "You cannot view these members"
    )
  } catch {
    return { success: false, error: "You cannot view these members" }
  }

  const grants = roleGrantsIn(organizationId)

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      direct: sql<boolean>`bool_or(${grants.groupId} is null)`,
      groups: sql<RoleGroupSummary[]>`coalesce(
        json_agg(
          json_build_object('id', ${group.id}, 'key', ${group.key}, 'name', ${group.name})
          order by ${group.name}
        ) filter (where ${group.id} is not null),
        '[]'
      )`,
    })
    .from(grants)
    .innerJoin(member, eq(member.id, grants.memberId))
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(group, eq(group.id, grants.groupId))
    .where(
      and(eq(grants.roleId, roleId), eq(member.organizationId, organizationId))
    )
    .groupBy(user.id)
    // Direct holders first, since they are the ones the caller can edit.
    .orderBy(
      sql`bool_or(${grants.groupId} is null) desc`,
      asc(user.name),
      asc(user.id)
    )
    .limit(MAX_MEMBERS)

  return { success: true, data: rows }
}
