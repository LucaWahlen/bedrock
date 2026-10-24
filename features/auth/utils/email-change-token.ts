// Better Auth's verification link is a signed JWT. One that changes an address
// carries the old address and the new one, and nothing else in its result says
// which kind was redeemed. Read only after Better Auth has verified the token,
// so decoding without checking the signature here trusts nothing new.
export function emailChangeOf(
  token: string
): { from: string; to: string } | null {
  const payload = token.split(".")[1]
  if (!payload) return null

  try {
    const binary = atob(payload.replaceAll("-", "+").replaceAll("_", "/"))
    const claims: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(binary, (character) => character.charCodeAt(0))
      )
    )
    if (typeof claims !== "object" || claims === null) return null

    const { email, updateTo } = claims as Record<string, unknown>

    return typeof email === "string" && typeof updateTo === "string"
      ? { from: email, to: updateTo }
      : null
  } catch {
    return null
  }
}
