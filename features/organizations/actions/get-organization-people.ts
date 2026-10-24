"use server"

import { and, asc, eq } from "drizzle-orm"

import {
  getAccessContext,
  isRootAdministrator,
  memberAdministers,
  splitRoles,
} from "@/features/auth"
import type {
  OrganizationPeopleEntry,
  OrganizationPeopleKind,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { member, user } from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

const MAX_PEOPLE = 200

// organizationId is a query target, not a claimed identity: access is gated on
// the caller's own root-administrator membership, re-derived below.
export async function getOrganizationPeople(
  organizationId: string,
  kind: OrganizationPeopleKind
): Promise<QueryResult<OrganizationPeopleEntry[]>> {
  // No session means no memberships, so this covers being signed out too.
  if (!isRootAdministrator(await getAccessContext())) {
    return { success: false, error: "You cannot view organization members" }
  }

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        memberAdministers(member.role, kind === "administrators")
      )
    )
    .orderBy(asc(user.name))
    .limit(MAX_PEOPLE)

  return {
    success: true,
    data: rows.map(({ role, ...person }) => ({
      ...person,
      roles: splitRoles(role),
    })),
  }
}
