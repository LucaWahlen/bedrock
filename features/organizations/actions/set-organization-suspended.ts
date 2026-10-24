"use server"

import { eq } from "drizzle-orm"

import { organizationStatusMutation } from "@/features/organizations/lib/organization-mutation"
import { organization } from "@/features/shared/lib/db/schema"
import type { ActionResult } from "@/features/shared/types"

export async function setOrganizationSuspended(
  organizationId: string,
  suspended: boolean
): Promise<ActionResult> {
  const expectedStatus = suspended ? "active" : "suspended"

  return organizationStatusMutation({
    action: suspended ? "organization.suspended" : "organization.reactivated",
    organizationId,
    require: "instance",
    expected: eq(organization.status, expectedStatus),
    set: { status: suspended ? "suspended" : "active" },
    deniedError: "You cannot change organization status",
    failureError: "Organization status cannot be changed",
    failureReason: `Organization was not ${expectedStatus}`,
  })
}
