"use server"

import { ne } from "drizzle-orm"

import { organizationStatusMutation } from "@/features/organizations/lib/organization-mutation"
import { organization } from "@/features/shared/lib/db/schema"
import type { ActionResult } from "@/features/shared/types"

// Deletion takes effect at once: nobody who belongs to the organization can
// reach it afterwards, and only the instance administrators can bring it back.
export async function deleteOrganization(
  organizationId: string
): Promise<ActionResult> {
  return organizationStatusMutation({
    action: "organization.deleted",
    organizationId,
    require: "owner",
    expected: ne(organization.status, "deleted"),
    set: { status: "deleted", deletedAt: new Date() },
    deniedError: "You cannot delete organizations",
    failureError: "Organization cannot be deleted",
    failureReason: "Organization is the root organization or already deleted",
  })
}
