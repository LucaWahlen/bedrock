"use server"

import { count, sql } from "drizzle-orm"

import { requireRootAdministration } from "@/features/auth"
import type { InstanceSummary } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { organization, user } from "@/features/shared/lib/db/schema"

// The instance at a glance. It counts across every tenant, so it answers only
// to a root administrator, as the Organizations page and Directory do.
export async function getInstanceSummary(): Promise<InstanceSummary> {
  await requireRootAdministration("You cannot view the instance")

  const [statuses, [users]] = await Promise.all([
    db
      .select({ status: organization.status, count: count() })
      .from(organization)
      .groupBy(organization.status),
    db
      .select({
        total: count(),
        unverified:
          sql<number>`count(*) filter (where not ${user.emailVerified})`.mapWith(
            Number
          ),
      })
      .from(user),
  ])

  const organizations: InstanceSummary["organizations"] = {
    active: 0,
    suspended: 0,
    deleted: 0,
  }
  for (const row of statuses) organizations[row.status] = row.count

  return {
    organizations,
    users: { total: users?.total ?? 0, unverified: users?.unverified ?? 0 },
  }
}
