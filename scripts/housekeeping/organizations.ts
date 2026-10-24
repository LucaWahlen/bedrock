import { and, eq, lte } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { deleteOrganizationObjects } from "@/features/organizations/lib/branding-storage"
import { organizationPurgeCutoff } from "@/features/organizations/utils/organization-retention"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"

export async function housekeepOrganizations() {
  const cutoff = organizationPurgeCutoff(
    new Date(),
    env.housekeeping.organizationRetentionDays
  )
  const isExpired = and(
    eq(organization.status, "deleted"),
    eq(organization.isRoot, false),
    lte(organization.deletedAt, cutoff)
  )
  const expired = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .where(isExpired)

  let deleted = 0
  const storageFailures: string[] = []

  for (const expiredOrganization of expired) {
    // Re-checked inside the transaction so a restore racing this run wins.
    const removed = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(organization)
        .where(and(eq(organization.id, expiredOrganization.id), isExpired))
        .returning({ id: organization.id })

      if (!row) return false

      await recordAuditEvent(
        {
          action: "organization.purged",
          actor: { type: "system" },
          organization: {
            id: expiredOrganization.id,
            name: expiredOrganization.name,
            slug: expiredOrganization.slug,
          },
          target: {
            type: "organization",
            id: expiredOrganization.id,
            label: expiredOrganization.name,
          },
          reason: "Retention period elapsed",
        },
        tx
      )

      return true
    })

    if (!removed) continue
    deleted += 1

    // After the commit: the database is the record, and an orphaned object is
    // recoverable where a deleted one is not.
    try {
      await deleteOrganizationObjects(expiredOrganization.id)
    } catch {
      storageFailures.push(expiredOrganization.id)
    }
  }

  return { deleted, storageFailures }
}
