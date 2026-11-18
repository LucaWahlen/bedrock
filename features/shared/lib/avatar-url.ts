import { createHmac, timingSafeEqual } from "node:crypto"

import { env } from "@/features/shared/lib/config/env"
import {
  AVATAR_VARIANTS,
  avatarInitials,
  avatarVariantIndex,
} from "@/features/shared/lib/ui/avatar-palette"

const AVATAR_DOMAIN = "bedrock:avatar:v1:"
const SIGNATURE_BYTES = 16
const MAX_TOKEN_LENGTH = 256
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/

export type DefaultAvatarSpec = {
  variantIndex: number
  initials: string
}

function signPayload(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(AVATAR_DOMAIN)
    .update(payload)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
}

// Encodes only the colour slot and initials, never the user id, and signs them
// so the endpoint only renders badges this instance minted.
export function createAvatarToken(
  user: { id: string; name: string },
  secret = env.auth.secret
): string {
  const variantIndex = avatarVariantIndex(user.id)
  const initials = avatarInitials(user.name)
  const payload = Buffer.from(
    JSON.stringify([variantIndex, initials]),
    "utf8"
  ).toString("base64url")
  const signature = signPayload(payload, secret).toString("base64url")

  return `${payload}.${signature}`
}

export function defaultAvatarUrl(
  user: { id: string; name: string },
  baseUrl = env.auth.url,
  secret = env.auth.secret
): string {
  const origin = baseUrl.replace(/\/+$/, "")
  return `${origin}/api/avatar/${createAvatarToken(user, secret)}.svg`
}

export function userPictureUrl(
  user: { id: string; name: string; image?: string | null },
  baseUrl = env.auth.url,
  secret = env.auth.secret
): string {
  const uploaded = user.image?.trim()
  if (uploaded) return uploaded

  return defaultAvatarUrl(user, baseUrl, secret)
}

export function verifyAvatarToken(
  rawToken: string,
  secret = env.auth.secret
): DefaultAvatarSpec | null {
  if (!rawToken || rawToken.length > MAX_TOKEN_LENGTH) return null

  const stripped = rawToken.endsWith(".svg") ? rawToken.slice(0, -4) : rawToken
  const parts = stripped.split(".")
  if (parts.length !== 2) return null

  const [payload, signature] = parts
  if (
    !payload ||
    !signature ||
    !BASE64URL_SEGMENT.test(payload) ||
    !BASE64URL_SEGMENT.test(signature)
  ) {
    return null
  }

  const expected = signPayload(payload, secret)
  const actual = Buffer.from(signature, "base64url")
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    )
    if (!Array.isArray(parsed) || parsed.length !== 2) return null

    const [variantIndex, initials] = parsed
    if (
      typeof variantIndex !== "number" ||
      !Number.isInteger(variantIndex) ||
      variantIndex < 0 ||
      variantIndex >= AVATAR_VARIANTS.length ||
      typeof initials !== "string"
    ) {
      return null
    }

    const chars = Array.from(initials)
    if (chars.length < 1 || chars.length > 2) return null

    return { variantIndex, initials }
  } catch {
    return null
  }
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export function renderDefaultAvatarSvg({
  variantIndex,
  initials,
}: DefaultAvatarSpec): string {
  const variant = AVATAR_VARIANTS[variantIndex] ?? AVATAR_VARIANTS[0]
  const escaped = escapeXml(initials)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${escaped}"><rect width="128" height="128" fill="${variant.svgBg}"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="${variant.svgText}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="52" font-weight="600">${escaped}</text></svg>`
}
