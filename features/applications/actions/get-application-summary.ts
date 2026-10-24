"use server"

import { count, eq } from "drizzle-orm"

import { requireApplicationAdministration } from "@/features/applications/lib/application-read"
import type { ApplicationSummaryCounts } from "@/features/applications/types"
import { db } from "@/features/shared/lib/db/client"
import { applicationRole, oauthClient } from "@/features/shared/lib/db/schema"

// The organization's application configuration at a glance, for the same
// administrators who may open the pages these numbers lead to.
export async function getApplicationSummary(
  organizationId: string
): Promise<ApplicationSummaryCounts> {
  const membership = await requireApplicationAdministration(
    organizationId,
    "You cannot view these applications"
  )

  const [[applications], [roles]] = await Promise.all([
    db
      .select({ count: count() })
      .from(oauthClient)
      .where(eq(oauthClient.referenceId, membership.organizationId)),
    db
      .select({ count: count() })
      .from(applicationRole)
      .where(eq(applicationRole.organizationId, membership.organizationId)),
  ])

  return {
    applications: applications?.count ?? 0,
    roles: roles?.count ?? 0,
  }
}
