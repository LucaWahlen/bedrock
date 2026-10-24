// The provider hands its screens the whole authorization query, signed. These
// parameters carry the signature itself and belong to that hand-off, so they
// are dropped when the request is replayed at the authorize endpoint.
const SIGNATURE_PARAMS = new Set(["exp", "sig"])
const SIGNATURE_PREFIX = "ba_"

type QueryEntries = Record<string, string | string[] | undefined>

export function toSearchParams(query: QueryEntries) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry)
    }
  }

  return params
}

// What the screens send back to `/oauth2/consent`, signature included: the
// provider verifies it to prove the decision belongs to this request.
export function signedOauthQuery(query: QueryEntries) {
  return toSearchParams(query).toString()
}

// Where a completed sign-in returns to, so the provider can resume the request
// it interrupted and issue the code itself.
export function authorizeUrl(query: QueryEntries) {
  const replayed = new URLSearchParams()

  for (const [key, value] of toSearchParams(query).entries()) {
    if (SIGNATURE_PARAMS.has(key) || key.startsWith(SIGNATURE_PREFIX)) continue
    replayed.append(key, value)
  }

  return `/api/auth/oauth2/authorize?${replayed.toString()}`
}
