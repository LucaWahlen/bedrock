import { auth } from "@/features/auth/lib/auth"

function clientIdFromHint(hint: string | null): string | null {
  if (!hint) return null
  const payloadSegment = hint.split(".")[1]
  if (!payloadSegment) return null

  try {
    const payload = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8")
    ) as Record<string, unknown>
    if (typeof payload.aud === "string" && payload.aud.length > 0) {
      return payload.aud
    }
    if (typeof payload.azp === "string" && payload.azp.length > 0) {
      return payload.azp
    }
    if (Array.isArray(payload.aud)) {
      const candidates = payload.aud.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0
      )
      if (candidates.length === 1) return candidates[0]
    }
  } catch {
    return null
  }

  return null
}

async function requestParameters(request: Request) {
  const url = new URL(request.url)
  const params = new URLSearchParams(url.searchParams)

  if (
    request.method === "POST" &&
    request.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded")
  ) {
    try {
      const body = new URLSearchParams(await request.clone().text())
      for (const [key, value] of body) {
        if (!params.has(key)) params.set(key, value)
      }
    } catch {
      // Malformed bodies are left for the provider to refuse.
    }
  }

  return params
}

// The provider handles the RP-Initiated Logout protocol, signed confirmation
// cookies and session revocation, but renders bare English HTML whenever it
// does not redirect to a registered post-logout URI. Translating those HTML
// responses into a 303 redirect lets `/oauth2/end-session` render in the
// organization's own shell and language while keeping every Set-Cookie header.
export async function oidcEndSessionEndpoint(request: Request) {
  const params = await requestParameters(request)
  const clientId =
    params.get("client_id") ?? clientIdFromHint(params.get("id_token_hint"))

  const url = new URL(request.url)
  const handlerRequest =
    url.pathname.endsWith("/end-session/confirm") && url.search
      ? new Request(new URL(url.pathname, url.origin), request)
      : request

  const response = await auth.handler(handlerRequest)
  if (!response.headers.get("content-type")?.includes("text/html")) {
    return response
  }

  const html = await response.text()
  const destination = new URL("/oauth2/end-session", request.url)

  if (html.includes("data-oidc-logout-confirmation")) {
    destination.searchParams.set("state", "confirm")
  } else if (html.includes('data-oidc-logout-state="error"')) {
    destination.searchParams.set("state", "error")
  } else {
    destination.searchParams.set("state", "logged-out")
    if (html.includes("post-logout redirect was not registered")) {
      destination.searchParams.set("unregistered", "1")
    }
  }

  if (clientId) {
    destination.searchParams.set("client_id", clientId)
  }

  const headers = new Headers({
    location: `${destination.pathname}${destination.search}`,
    "cache-control": "no-store",
  })
  for (const cookie of response.headers.getSetCookie()) {
    headers.append("set-cookie", cookie)
  }

  return new Response(null, { status: 303, headers })
}
