"use server"

import { eq } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { oauthClient, organization } from "@/features/shared/lib/db/schema"

export type AuthorizationContext = {
  name: string
  uri: string | null
  icon: string | null
  organizationSlug: string
}

// Read by the sign-in and consent screens, which an anonymous visitor reaches
// by design. It answers only what a consent screen must show anyway: the
// application's name and which organization is asking. Never the secret, the
// redirect URIs, or anything about the organization's members.
export async function getAuthorizationContext(
  clientId: string
): Promise<AuthorizationContext | null> {
  if (!clientId) return null

  const [found] = await db
    .select({
      name: oauthClient.name,
      uri: oauthClient.uri,
      icon: oauthClient.icon,
      disabled: oauthClient.disabled,
      organizationSlug: organization.slug,
      organizationStatus: organization.status,
    })
    .from(oauthClient)
    .innerJoin(organization, eq(organization.id, oauthClient.referenceId))
    .where(eq(oauthClient.clientId, clientId))
    .limit(1)

  if (!found || found.disabled) return null
  // An organization nobody may enter cannot be signed in to either.
  if (found.organizationStatus !== "active") return null

  return {
    name: found.name ?? clientId,
    uri: found.uri,
    icon: found.icon,
    organizationSlug: found.organizationSlug,
  }
}
