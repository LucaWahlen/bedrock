"use server"

import { and, asc, desc, inArray, ne } from "drizzle-orm"

import { getAccessContext } from "@/features/auth"
import type { Organization } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"

// The organizations the caller belongs to. Membership decides the set, so
// nothing the browser sends can widen it.
export async function listOrganizations(): Promise<Organization[]> {
  const access = await getAccessContext()
  const organizationIds = access.memberships.map(
    (membership) => membership.organizationId
  )
  if (organizationIds.length === 0) return []

  return db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      isRoot: organization.isRoot,
      status: organization.status,
      color: organization.color,
      backgroundImage: organization.backgroundImage,
      favicon: organization.favicon,
    })
    .from(organization)
    .where(
      and(
        inArray(organization.id, organizationIds),
        ne(organization.status, "deleted")
      )
    )
    .orderBy(desc(organization.isRoot), asc(organization.name))
}
