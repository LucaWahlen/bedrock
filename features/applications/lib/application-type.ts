import { sql } from "drizzle-orm"

import type { ApplicationType } from "@/features/applications/types"
import { oauthClient } from "@/features/shared/lib/db/schema"

// A client without a secret authenticates with method `none`; anything else,
// including an unset method, is confidential.
export const APPLICATION_TYPE_CONDITION = {
  public: sql`${oauthClient.tokenEndpointAuthMethod} = 'none'`,
  confidential: sql`${oauthClient.tokenEndpointAuthMethod} is distinct from 'none'`,
} satisfies Record<ApplicationType, unknown>

// Both types together are every application, so only a single one narrows.
export function applicationTypeFilter(types: ApplicationType[]) {
  return types.length === 1 ? APPLICATION_TYPE_CONDITION[types[0]] : undefined
}

export function applicationTypeCount(type: ApplicationType) {
  return sql<number>`count(*) filter (where ${APPLICATION_TYPE_CONDITION[type]})`.mapWith(
    Number
  )
}
