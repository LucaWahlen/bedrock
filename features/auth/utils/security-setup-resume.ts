// Where a member is sent when an authorization stopped for the second factor
// their organization requires, and where finishing that sends them back to.
// The parameters are only carried, never trusted: resuming replays them at the
// provider's own authorize endpoint, which validates the client, its exact
// redirect URIs and PKCE again, just as the sign-in screens' resume does.

const AUTHORIZE_PATH = "/api/auth/oauth2/authorize"

// Long enough for any real authorization request, short enough that a crafted
// one cannot bloat the URL past what proxies accept.
const MAX_CARRIED_QUERY_LENGTH = 4096

// The authorization request as the provider itself serializes it: strings and
// repeated values as they are, a `claims` object as JSON, nothing else.
export function authorizationParameters(
  source: Record<string, unknown> | URLSearchParams | undefined
) {
  if (source instanceof URLSearchParams) return new URLSearchParams(source)

  const parameters = new URLSearchParams()
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" || typeof entry === "number") {
          parameters.append(key, String(entry))
        }
      }
    } else if (typeof value === "string" || typeof value === "number") {
      parameters.set(key, String(value))
    } else if (key === "claims" && typeof value === "object") {
      parameters.set(key, JSON.stringify(value))
    }
  }

  return parameters
}

export function securitySetupUrl(
  organizationSlug: string,
  parameters?: URLSearchParams
) {
  const base = `/org/${encodeURIComponent(organizationSlug)}/setup-security`
  const query = parameters?.get("client_id") ? parameters.toString() : ""

  return query && query.length <= MAX_CARRIED_QUERY_LENGTH
    ? `${base}?${query}`
    : base
}

/**
 * Where "Continue" on the setup page leads. Back into the authorization only
 * when the application it names is live and belongs to this very organization,
 * and only ever to the local authorize endpoint; anything else is the
 * organization itself.
 */
export function securitySetupContinueHref({
  organizationSlug,
  applicationOrganizationSlug,
  authorizeHref,
}: {
  organizationSlug: string
  // Null for an unknown, disabled or unavailable application.
  applicationOrganizationSlug: string | null
  authorizeHref: string | null
}) {
  const organizationHref = `/org/${organizationSlug}`
  if (
    !authorizeHref ||
    applicationOrganizationSlug !== organizationSlug ||
    !authorizeHref.startsWith(`${AUTHORIZE_PATH}?`)
  ) {
    return { href: organizationHref, resumesAuthorization: false }
  }

  return { href: authorizeHref, resumesAuthorization: true }
}
