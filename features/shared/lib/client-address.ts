// Headers the common proxies set, most specific first: Cloudflare, then
// nginx-style single headers, then the generic forwarded chain. The first
// present header wins, so no deployment-specific configuration is needed. A
// client reaching the app without a proxy can spoof any of these; rate limits
// treat the address as a best-effort signal, never as identity.
const CLIENT_ADDRESS_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const

export function clientAddress(requestHeaders: Headers) {
  for (const header of CLIENT_ADDRESS_HEADERS) {
    const value = requestHeaders.get(header)
    if (!value) continue

    const address = value.split(",", 1)[0]?.trim()
    if (address) return address
  }

  return null
}
