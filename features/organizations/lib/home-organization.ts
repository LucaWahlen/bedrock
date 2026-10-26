import { and, eq } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { member, organization } from "@/features/shared/lib/db/schema"

// Where a link mailed on someone's behalf should land: an organization they can
// enter, or root's own pages when they belong nowhere else.
export async function homeOrganizationSlug(userId: string) {
  const [home] = await db
    .select({ slug: organization.slug })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(organization.status, "active")))
    .orderBy(organization.isRoot, organization.name)
    .limit(1)
  if (home) return home.slug

  const [root] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.isRoot, true))
    .limit(1)

  return root?.slug ?? null
}
