"use server"

import type { OidcConfiguration } from "@/features/applications/types"
import {
  getAccessContext,
  OIDC_SCOPES,
  OIDC_SIGNING_ALGORITHM,
} from "@/features/auth"
import { UnauthorizedError } from "@/features/shared/lib/authorization-error"
import { env } from "@/features/shared/lib/config/env"

// Mirrors what discovery publishes, so the values shown in the app are the ones
// a relying party would fetch for itself. The issuer is Better Auth's base URL
// plus its default base path.
export async function getOidcConfiguration(): Promise<OidcConfiguration> {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const issuer = `${env.auth.url.replace(/\/+$/, "")}/api/auth`

  return {
    issuer,
    discovery: `${issuer}/.well-known/openid-configuration`,
    authorization: `${issuer}/oauth2/authorize`,
    token: `${issuer}/oauth2/token`,
    jwks: `${issuer}/jwks`,
    userinfo: `${issuer}/oauth2/userinfo`,
    endSession: `${issuer}/oauth2/end-session`,
    signingAlgorithm: OIDC_SIGNING_ALGORITHM,
    scopes: [...OIDC_SCOPES],
  }
}
