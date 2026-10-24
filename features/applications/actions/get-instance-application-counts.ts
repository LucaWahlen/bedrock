"use server"

import { count, eq } from "drizzle-orm"

import type { InstanceApplicationCounts } from "@/features/applications/types"
import { requireRootAdministration } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { oauthClient, organization } from "@/features/shared/lib/db/schema"

// Every application registered on the instance, counted the way the root
// organization's Applications page lists them: by their owning organization.
export async function getInstanceApplicationCounts(): Promise<InstanceApplicationCounts> {
  await requireRootAdministration("You cannot view instance applications")

  const [applications] = await db
    .select({ count: count() })
    .from(oauthClient)
    .innerJoin(organization, eq(organization.id, oauthClient.referenceId))

  return { applications: applications?.count ?? 0 }
}
