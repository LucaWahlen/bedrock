"use server"

import { asc, eq } from "drizzle-orm"

import {
  getAccessContext,
  isRootAdministrator,
  splitRoles,
} from "@/features/auth"
import type { Membership } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { member, organization } from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

const MAX_MEMBERSHIPS = 200

// Which organizations one account belongs to. This crosses every tenant, so it
// answers only to a root administrator, as the directory itself does.
export async function getUserMemberships(
  userId: string
): Promise<QueryResult<Membership[]>> {
  // No session means no memberships, so this covers being signed out too.
  if (!isRootAdministrator(await getAccessContext())) {
    return { success: false, error: "You cannot view these memberships" }
  }

  const rows = await db
    .select({
      organizationId: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      isRoot: organization.isRoot,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name))
    .limit(MAX_MEMBERSHIPS)

  return {
    success: true,
    data: rows.map((row) => ({
      organizationId: row.organizationId,
      name: row.name,
      slug: row.slug,
      logo: row.logo,
      isRoot: row.isRoot,
      roles: splitRoles(row.role),
      joinedAt: row.joinedAt.toISOString(),
    })),
  }
}
