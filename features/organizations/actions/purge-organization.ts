"use server"

import { and, eq } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { deleteOrganizationObjects } from "@/features/organizations/lib/branding-storage"
import { authorizeOrganizationMutation } from "@/features/organizations/lib/organization-mutation"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// What housekeeping does once the retention period is over, done now. Only an
// organization that is already deleted qualifies, so an owner's deletion still
// gets root's second look, and nothing active can be purged in one step.
export async function purgeOrganization(
  organizationId: string
): Promise<ActionResult> {
  const authorization = await authorizeOrganizationMutation({
    action: "organization.purged",
    organizationId,
    require: "instance",
    deniedError: "You cannot purge organizations",
  })
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { actor, organization: subject } = authorization.context

  const purged = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(organization)
      .where(
        and(
          eq(organization.id, subject.id),
          eq(organization.status, "deleted"),
          eq(organization.isRoot, false)
        )
      )
      .returning({ id: organization.id })
    if (!row) return false

    await recordAuditEvent(
      {
        action: "organization.purged",
        actor,
        organization: {
          id: subject.id,
          name: subject.name,
          slug: subject.slug,
        },
        target: { type: "organization", id: subject.id, label: subject.name },
        reason: "Purged by a root administrator",
      },
      tx
    )

    return true
  })

  if (!purged) {
    await recordAuditEvent({
      action: "organization.purged",
      outcome: "failure",
      actor,
      organization: { id: subject.id, name: subject.name, slug: subject.slug },
      target: { type: "organization", id: subject.id },
      reason: "Organization was not deleted",
    })

    return {
      success: false,
      error: "Only a deleted organization can be purged",
    }
  }

  // After the commit: the database is the record, and an object left behind is
  // recoverable where a row deleted too early is not.
  await deleteOrganizationObjects(subject.id).catch((error: unknown) => {
    console.error(
      "Purged organization's stored objects were not removed",
      error
    )
  })

  revalidateEverywhere()

  return { success: true }
}
