// Headers the common proxies set, most specific first: Cloudflare, then
// nginx-style single headers, then the generic forwarded chain. The first
// present header wins, so no deployment-specific configuration is needed. A
// client reaching the app without a proxy can spoof any of these; rate limits
// treat the address as a best-effort signal, never as identity.
export const CLIENT_ADDRESS_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const

function stripPort(candidate: string) {
  if (candidate.startsWith("[")) {
    const end = candidate.indexOf("]")
    return end > 1 ? candidate.slice(1, end) : candidate
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    return candidate.slice(0, candidate.lastIndexOf(":"))
  }

  return candidate
}

function resolveClientAddress(requestHeaders: Headers) {
  for (const header of CLIENT_ADDRESS_HEADERS) {
    const value = requestHeaders.get(header)
    if (!value) continue

    const firstHop = value.split(",", 1)[0]?.trim()
    if (!firstHop) continue

    return { header, address: stripPort(firstHop) }
  }

  return null
}

export function clientAddress(requestHeaders: Headers) {
  return resolveClientAddress(requestHeaders)?.address ?? null
}

// Better Auth refuses a multi-hop forwarded header unless proxy CIDRs are
// configured, and rejects `ip:port` values outright. Rewriting the winning
// header to the resolved first hop gives its HTTP limiter the same address
// `clientAddress` uses everywhere else, with no deployment-specific config.
export function withNormalizedClientAddress(request: Request) {
  const resolved = resolveClientAddress(request.headers)
  if (!resolved || request.headers.get(resolved.header) === resolved.address) {
    return request
  }

  const headers = new Headers(request.headers)
  headers.set(resolved.header, resolved.address)
  return new Request(request, { headers })
}
