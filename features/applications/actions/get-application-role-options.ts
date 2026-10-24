"use server"

import { asc, countDistinct, eq } from "drizzle-orm"

import { requireApplicationAdministration } from "@/features/applications/lib/application-read"
import type { ApplicationRoleOption } from "@/features/applications/types"
import { db } from "@/features/shared/lib/db/client"
import { applicationRole } from "@/features/shared/lib/db/schema"
import { roleGrantsIn } from "@/features/shared/lib/role-grants"

// Every role of an organization, for pickers and filters. The count is of
// effective holders, directly or through a group.
export async function getApplicationRoleOptions(
  organizationId: string
): Promise<ApplicationRoleOption[]> {
  await requireApplicationAdministration(
    organizationId,
    "You cannot view these roles"
  )

  const grants = roleGrantsIn(organizationId)

  return db
    .select({
      id: applicationRole.id,
      key: applicationRole.key,
      name: applicationRole.name,
      description: applicationRole.description,
      memberCount: countDistinct(grants.memberId),
    })
    .from(applicationRole)
    .leftJoin(grants, eq(grants.roleId, applicationRole.id))
    .where(eq(applicationRole.organizationId, organizationId))
    .groupBy(applicationRole.id)
    .orderBy(asc(applicationRole.name))
}
