import { recordTokenRefused } from "@/features/shared/lib/telemetry/metrics"

// Which application asked for what. Never the code, the secret, the verifier or
// a refresh token: only fields that identify the request, not ones that could
// replay it.
export type TokenRequestSummary = {
  clientId: string | null
  grantType: string
}

const KNOWN_GRANT_TYPES = new Set(["authorization_code", "refresh_token"])
const OAUTH_ERROR = /^[a-z_]{1,64}$/

// Untrusted input on its way into a log line, so it is bounded and stripped of
// anything that could forge a second line.
function printable(value: string, max = 128) {
  return value.replace(/[^\x20-\x7e]/g, "").slice(0, max)
}

function basicClientId(authorization: string | null) {
  if (!authorization?.toLowerCase().startsWith("basic ")) return null

  try {
    const decoded = atob(authorization.slice(6).trim())
    const separator = decoded.indexOf(":")
    if (separator <= 0) return null
    // RFC 6749 §2.3.1 form-encodes the id before the Basic encoding.
    return decodeURIComponent(decoded.slice(0, separator).replaceAll("+", " "))
  } catch {
    return null
  }
}

// Read from a clone, so the provider still gets the untouched request.
export async function summarizeTokenRequest(
  request: Request
): Promise<TokenRequestSummary> {
  const body = await request
    .clone()
    .formData()
    .catch(() => null)
  const field = (name: string) => {
    const value = body?.get(name)
    return typeof value === "string" && value.length > 0 ? value : null
  }

  const clientId =
    basicClientId(request.headers.get("authorization")) ?? field("client_id")
  const grantType = field("grant_type") ?? "missing"

  return {
    clientId: clientId ? printable(clientId) : null,
    grantType: KNOWN_GRANT_TYPES.has(grantType) ? grantType : "other",
  }
}

// A refused token request is otherwise invisible: the application shows its
// own generic error and Bedrock answers without a trace. One line names the
// client and the OAuth error, which is what tells a stale secret from a
// removed member.
export async function recordRefusedTokenRequest(
  summary: TokenRequestSummary,
  response: Response
) {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null)
  const fields =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const reported = typeof fields.error === "string" ? fields.error : ""
  const error = OAUTH_ERROR.test(reported)
    ? reported
    : response.status >= 500
      ? "server_error"
      : "unknown"
  const description =
    typeof fields.error_description === "string"
      ? printable(fields.error_description, 256)
      : null

  recordTokenRefused(error, summary.grantType)
  console.warn(
    "[oidc] token request refused",
    JSON.stringify({
      status: response.status,
      error,
      error_description: description,
      client_id: summary.clientId,
      grant_type: summary.grantType,
    })
  )
}
