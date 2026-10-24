"use server"

import { and, asc, desc, eq, inArray } from "drizzle-orm"

import {
  canAccessOrganization,
  getAccessContext,
  splitRoles,
} from "@/features/auth"
import { primaryRole } from "@/features/organizations/lib/member-role-display"
import type { MemberOrganization } from "@/features/organizations/types"
import { UnauthorizedError } from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"

// The caller's other organizations. Membership decides the set, so nothing the
// browser sends can widen it; the one being viewed is left out.
export async function getMemberOrganizations(
  excludeOrganizationId?: string
): Promise<MemberOrganization[]> {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const memberships = access.memberships.filter(
    (membership) =>
      membership.organizationId !== excludeOrganizationId &&
      canAccessOrganization(membership)
  )
  if (memberships.length === 0) return []

  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      isRoot: organization.isRoot,
    })
    .from(organization)
    .where(
      and(
        inArray(
          organization.id,
          memberships.map((membership) => membership.organizationId)
        ),
        // Read again rather than trusted from the request's first look.
        eq(organization.status, "active")
      )
    )
    .orderBy(desc(organization.isRoot), asc(organization.name))

  const roles = new Map(
    memberships.map((membership) => [
      membership.organizationId,
      primaryRole(splitRoles(membership.role)),
    ])
  )

  return rows.map((row) => ({
    ...row,
    role: roles.get(row.id) ?? "member",
  }))
}
