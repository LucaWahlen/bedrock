"use server"

import { asc, eq } from "drizzle-orm"

import { requireApplicationAdministration } from "@/features/applications/lib/application-read"
import type { ApplicationSummary } from "@/features/applications/types"
import { db } from "@/features/shared/lib/db/client"
import { oauthClient } from "@/features/shared/lib/db/schema"

// Every application of an organization, for pickers and filters.
export async function getApplicationOptions(
  organizationId: string
): Promise<ApplicationSummary[]> {
  await requireApplicationAdministration(
    organizationId,
    "You cannot view these applications"
  )

  const rows = await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      icon: oauthClient.icon,
    })
    .from(oauthClient)
    .where(eq(oauthClient.referenceId, organizationId))
    .orderBy(asc(oauthClient.name), asc(oauthClient.clientId))

  return rows.map((row) => ({ ...row, name: row.name ?? row.clientId }))
}
