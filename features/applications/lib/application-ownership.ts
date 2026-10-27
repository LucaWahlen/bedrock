import { and, eq } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { oauthClient } from "@/features/shared/lib/db/schema"

// The plugin authorizes the caller against the owning organization, but the
// client id still arrives from the browser. Proving the two belong together is
// what stops an administrator of one tenant acting on another tenant's client.
export async function applicationInOrganization(
  clientId: string,
  organizationId: string
) {
  const [found] = await db
    .select({
      clientId: oauthClient.clientId,
      name: oauthClient.name,
      icon: oauthClient.icon,
      tokenEndpointAuthMethod: oauthClient.tokenEndpointAuthMethod,
    })
    .from(oauthClient)
    .where(
      and(
        eq(oauthClient.clientId, clientId),
        eq(oauthClient.referenceId, organizationId)
      )
    )
    .limit(1)

  return found ?? null
}
