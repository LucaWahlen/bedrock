import { inArray } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import {
  oauthAccessToken,
  oauthRefreshToken,
} from "@/features/shared/lib/db/schema"

// An application's refresh token never outlives the Bedrock session it was
// issued from. The provider keeps `offline_access` refresh tokens when a session
// ends, so signing out, a password reset or revoking a session would otherwise
// leave every application able to renew its access indefinitely.
//
// Must run before the session rows go: the token's `session_id` is set null on
// delete, after which nothing links the token to the session that ended.
export async function revokeSessionRefreshTokens(sessionIds: string[]) {
  if (sessionIds.length === 0) return

  await db
    .delete(oauthRefreshToken)
    .where(inArray(oauthRefreshToken.sessionId, sessionIds))
}

// For sessions deleted directly rather than through Better Auth, where the
// provider's own session hook never runs and access tokens would be left too.
export async function revokeSessionOAuthTokens(sessionIds: string[]) {
  if (sessionIds.length === 0) return

  await Promise.all([
    revokeSessionRefreshTokens(sessionIds),
    db
      .delete(oauthAccessToken)
      .where(inArray(oauthAccessToken.sessionId, sessionIds)),
  ])
}
