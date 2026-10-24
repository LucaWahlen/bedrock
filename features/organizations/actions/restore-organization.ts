"use server"

import { eq } from "drizzle-orm"

import { organizationStatusMutation } from "@/features/organizations/lib/organization-mutation"
import { organization } from "@/features/shared/lib/db/schema"
import type { ActionResult } from "@/features/shared/types"

// A deleted organization is invisible to everyone who belongs to it, so only
// the instance administrators are in a position to bring it back.
export async function restoreOrganization(
  organizationId: string
): Promise<ActionResult> {
  return organizationStatusMutation({
    action: "organization.restored",
    organizationId,
    require: "instance",
    expected: eq(organization.status, "deleted"),
    set: { status: "active", deletedAt: null },
    deniedError: "You cannot restore organizations",
    failureError: "Organization cannot be restored",
    failureReason: "Organization was not deleted",
  })
}
