import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api"

import { ACCOUNT_DISABLED_MESSAGE } from "@/features/auth/lib/account-disabled"
import {
  authorizationParameters,
  securitySetupUrl,
} from "@/features/auth/utils/security-setup-resume"

// An absent scope falls back to the provider's defaults, which include openid.
export function scopeIncludesOpenId(scope: unknown) {
  if (scope === undefined || scope === null) return true

  return typeof scope === "string" && scope.split(" ").includes("openid")
}

function stringParameter(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

// Without `openid` the provider mints an opaque token and runs none of the
// claim callbacks, so the membership check there would never happen.
function refuseWithoutOpenId(scope: unknown) {
  if (!scopeIncludesOpenId(scope)) {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_scope",
      error_description: "The openid scope is required",
    })
  }
}

// The claim callbacks refuse a token too late to tell the person why, and only
// when one is minted at all. This settles membership before any code exists.
export const oidcAuthorizationGate = createAuthMiddleware(async (ctx) => {
  const isAuthorize = ctx.path === "/oauth2/authorize"
  const isConsent = ctx.path === "/oauth2/consent" && ctx.body?.accept === true
  if (!isAuthorize && !isConsent) return

  let clientId: string | undefined
  // The request as it was asked for, so enrolling a missing second factor can
  // resume it rather than strand the member in the organization.
  let request: URLSearchParams
  if (isAuthorize) {
    const parameters: Record<string, unknown> | undefined =
      ctx.method === "POST" ? ctx.body : ctx.query
    refuseWithoutOpenId(parameters?.scope)
    clientId = stringParameter(parameters?.client_id)
    request = authorizationParameters(parameters)
  } else {
    // Only read for the decision; the provider verifies the signature itself.
    const query = new URLSearchParams(stringParameter(ctx.body?.oauth_query))
    refuseWithoutOpenId(ctx.body?.scope ?? query.get("scope"))
    clientId = stringParameter(query.get("client_id"))
    request = query
  }

  if (!clientId) return

  // Signing in comes first; the provider sends an anonymous visitor there.
  const session = await getSessionFromCtx(ctx)
  if (!session) return

  // Imported at call time so the database client stays out of this module.
  const { authorizationRefusal } =
    await import("@/features/shared/lib/oidc-claims")
  const refusal = await authorizationRefusal(session.user.id, clientId)
  if (!refusal) return

  if (refusal.reason === "account_disabled") {
    throw new APIError("FORBIDDEN", {
      error: "access_denied",
      error_description: ACCOUNT_DISABLED_MESSAGE,
    })
  }

  if (
    refusal.reason !== "not_member" &&
    refusal.reason !== "second_factor_required"
  ) {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_client",
      error_description: "This application is not available",
    })
  }

  // A member without the second factor their organization requires is sent to
  // enrol one, which is something they can do, rather than turned away.
  const url =
    refusal.reason === "second_factor_required"
      ? securitySetupUrl(refusal.organizationSlug, request)
      : `/org/${encodeURIComponent(refusal.organizationSlug)}/forbidden`
  const wantsJson =
    isConsent || ctx.headers?.get("accept")?.includes("application/json")

  if (wantsJson) return { redirect: true, url }

  throw ctx.redirect(url)
})
