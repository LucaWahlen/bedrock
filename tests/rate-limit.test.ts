import { afterAll, describe, expect, test } from "bun:test"

import { getIP } from "better-auth/api"
import { like } from "drizzle-orm"

import { auth } from "@/features/auth"
import {
  clientAddress,
  withNormalizedClientAddress,
} from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { rateLimit } from "@/features/shared/lib/db/schema"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"

const prefix = `rate-limit-test:${crypto.randomUUID().slice(0, 8)}:`
const key = (name: string) => `${prefix}${name}`

afterAll(async () => {
  await db.delete(rateLimit).where(like(rateLimit.key, `${prefix}%`))
})

describe("consumeRateLimit window progression", () => {
  test("steady traffic below the rate limit never accumulates into a lockout", async () => {
    const bucket = key("steady")
    const rule = { window: 60, max: 3 }
    const start = 1_700_000_000_000

    // One request every 25 seconds is 2.4/min, below 3/min, even though no gap
    // between consecutive requests ever reaches 60 seconds.
    for (let step = 0; step < 10; step++) {
      const decision = await consumeRateLimit(
        bucket,
        rule,
        start + step * 25_000
      )
      expect(decision).toEqual({ allowed: true, retryAfter: null })
    }
  })

  test("refuses once max is exceeded and opens again when the window elapses", async () => {
    const bucket = key("burst")
    const rule = { window: 60, max: 2 }
    const start = 1_700_000_000_000

    expect(await consumeRateLimit(bucket, rule, start)).toEqual({
      allowed: true,
      retryAfter: null,
    })
    expect(await consumeRateLimit(bucket, rule, start + 10_000)).toEqual({
      allowed: true,
      retryAfter: null,
    })
    expect(await consumeRateLimit(bucket, rule, start + 15_000)).toEqual({
      allowed: false,
      retryAfter: 45,
    })
    // Blocked attempts do not push the lockout further out.
    expect(await consumeRateLimit(bucket, rule, start + 59_000)).toEqual({
      allowed: false,
      retryAfter: 1,
    })
    // Once the original 60-second window finishes, a fresh window begins.
    expect(await consumeRateLimit(bucket, rule, start + 60_000)).toEqual({
      allowed: true,
      retryAfter: null,
    })
  })

  test("resetRateLimit clears a spent bucket immediately", async () => {
    const bucket = key("reset")
    const rule = { window: 60, max: 1 }
    const start = 1_700_000_000_000

    expect((await consumeRateLimit(bucket, rule, start)).allowed).toBe(true)
    expect((await consumeRateLimit(bucket, rule, start + 1_000)).allowed).toBe(
      false
    )

    await resetRateLimit(bucket)

    expect((await consumeRateLimit(bucket, rule, start + 2_000)).allowed).toBe(
      true
    )
  })
})

function oidcRequest(headers: Record<string, string>) {
  return withNormalizedClientAddress(
    new Request("https://bedrock.example.test/api/auth/oauth2/token", {
      method: "POST",
      body: "grant_type=refresh_token",
      headers,
    })
  )
}

describe("OIDC and action client address resolution agree across proxies", () => {
  test("prefers cf-connecting-ip over forwarded chains", () => {
    const req = oidcRequest({
      "cf-connecting-ip": "198.51.100.7",
      "x-real-ip": "192.0.2.10",
      "x-forwarded-for": "198.51.100.7, 192.0.2.10",
    })

    expect(clientAddress(req.headers)).toBe("198.51.100.7")
    expect(getIP(req, auth.options)).toBe("198.51.100.7")
  })

  test("uses x-real-ip when present behind nginx or Traefik", () => {
    const req = oidcRequest({
      "x-real-ip": "203.0.113.42",
      "x-forwarded-for": "203.0.113.42, 192.0.2.1",
    })

    expect(clientAddress(req.headers)).toBe("203.0.113.42")
    expect(getIP(req, auth.options)).toBe("203.0.113.42")
  })

  test("resolves the first hop of a multi-proxy x-forwarded-for chain", () => {
    const req = oidcRequest({
      "x-forwarded-for": "203.0.113.9, 198.51.100.2, 192.0.2.3",
    })

    expect(clientAddress(req.headers)).toBe("203.0.113.9")
    expect(getIP(req, auth.options)).toBe("203.0.113.9")
  })

  test("strips proxy port suffixes from IPv4 and bracketed IPv6 addresses", async () => {
    const v4 = oidcRequest({ "x-forwarded-for": "203.0.113.9:54321" })
    expect(clientAddress(v4.headers)).toBe("203.0.113.9")
    expect(getIP(v4, auth.options)).toBe("203.0.113.9")
    // Rewriting headers preserves the POST body for token requests.
    expect(await v4.text()).toBe("grant_type=refresh_token")

    const v6 = oidcRequest({ "x-real-ip": "[2001:db8::1]:54321" })
    expect(clientAddress(v6.headers)).toBe("2001:db8::1")
    expect(getIP(v6, auth.options)).toBe(
      "2001:0db8:0000:0000:0000:0000:0000:0000"
    )
  })
})
