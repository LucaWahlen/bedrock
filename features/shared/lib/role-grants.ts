import { and, eq, sql } from "drizzle-orm"
import { unionAll } from "drizzle-orm/pg-core"

import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleGroup,
  applicationRoleMember,
  groupMember,
} from "@/features/shared/lib/db/schema"

// Every way a member of `organizationId` holds an application role, one row per
// way: `groupId` is null for a direct assignment and names the granting group
// otherwise. A member's effective roles are the distinct roles across their
// rows. This is the one definition of that union, shared by the members table,
// the roles page and the token claims, so none of them can disagree about who
// holds what.
//
// Only a query builder: callers join, filter and execute it, and Postgres pushes
// their member and role predicates down into both branches.
export function roleGrantsIn(organizationId: string) {
  const direct = db
    .select({
      memberId: applicationRoleMember.memberId,
      roleId: applicationRoleMember.roleId,
      groupId: sql<string | null>`null::text`.as("group_id"),
    })
    .from(applicationRoleMember)
    .innerJoin(
      applicationRole,
      eq(applicationRole.id, applicationRoleMember.roleId)
    )
    .where(eq(applicationRole.organizationId, organizationId))

  // The composite foreign keys already hold a group, its members and its roles
  // to one organization; matching it here again keeps every branch scoped.
  const viaGroup = db
    .select({
      memberId: groupMember.memberId,
      roleId: applicationRoleGroup.roleId,
      groupId: sql<string | null>`${groupMember.groupId}`.as("group_id"),
    })
    .from(groupMember)
    .innerJoin(
      applicationRoleGroup,
      and(
        eq(applicationRoleGroup.groupId, groupMember.groupId),
        eq(applicationRoleGroup.organizationId, groupMember.organizationId)
      )
    )
    .where(eq(groupMember.organizationId, organizationId))

  return unionAll(direct, viaGroup).as("role_grant")
}
