"use server"

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm"

import type {
  ApplicationRoleSummary,
  MemberApplication,
} from "@/features/applications/types"
import { launchUrlOf } from "@/features/applications/utils/launch-url"
import {
  canAccessOrganization,
  getAccessContext,
  membershipIn,
} from "@/features/auth"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  member,
  oauthClient,
} from "@/features/shared/lib/db/schema"
import { roleGrantsIn } from "@/features/shared/lib/role-grants"

const MAX_APPLICATIONS = 100

// What the caller can sign into here. A member may sign into an enabled
// application only when they hold at least one role linked to it, directly or
// through a group, which is the same rule the authorization gate applies.
export async function getMemberApplications(
  organizationId: string
): Promise<MemberApplication[]> {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const membership = membershipIn(access, organizationId)
  if (!membership || !canAccessOrganization(membership)) {
    throw new ForbiddenError("You cannot view these applications")
  }

  // Held directly or through a group, exactly as the token will carry them.
  const grants = roleGrantsIn(membership.organizationId)
  const roleRows = await db
    .selectDistinct({
      clientId: applicationRoleClient.clientId,
      id: applicationRole.id,
      key: applicationRole.key,
      name: applicationRole.name,
    })
    .from(grants)
    .innerJoin(member, eq(member.id, grants.memberId))
    .innerJoin(applicationRole, eq(applicationRole.id, grants.roleId))
    .innerJoin(
      applicationRoleClient,
      eq(applicationRoleClient.roleId, applicationRole.id)
    )
    .where(
      and(
        eq(member.userId, access.user.id),
        eq(member.organizationId, membership.organizationId),
        eq(applicationRole.organizationId, membership.organizationId)
      )
    )
    .orderBy(asc(applicationRole.name))

  const rolesByClient = new Map<string, ApplicationRoleSummary[]>()
  for (const { clientId, ...role } of roleRows) {
    rolesByClient.set(clientId, [...(rolesByClient.get(clientId) ?? []), role])
  }

  const clientIds = [...rolesByClient.keys()]
  if (clientIds.length === 0) return []

  const rows = await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      icon: oauthClient.icon,
      uri: oauthClient.uri,
    })
    .from(oauthClient)
    .where(
      and(
        eq(oauthClient.referenceId, membership.organizationId),
        inArray(oauthClient.clientId, clientIds),
        or(isNull(oauthClient.disabled), eq(oauthClient.disabled, false))
      )
    )
    .orderBy(asc(oauthClient.name), asc(oauthClient.clientId))
    .limit(MAX_APPLICATIONS)

  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.name ?? row.clientId,
    icon: row.icon,
    launchUrl: launchUrlOf(row.uri),
    roles: rolesByClient.get(row.clientId) ?? [],
  }))
}
