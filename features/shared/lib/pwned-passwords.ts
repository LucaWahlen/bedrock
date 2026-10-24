import { createHash } from "node:crypto"

import { env } from "@/features/shared/lib/config/env"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"

// Have I Been Pwned's range endpoint, which is free and unauthenticated. Only
// the first five characters of the SHA-1 are sent, so the service sees a bucket
// shared with roughly two thousand other passwords and never the password.
//
// Server-side only: this is enforcement rather than advice, and doing it in the
// browser would send every visitor's keystrokes to a third party.
const ENDPOINT = "https://api.pwnedpasswords.com/range"

const TIMEOUT_MS = 1500

// Caps the outbound work one source can make this instance do. It is not a
// limit on the person choosing a password: running out skips the check, the
// same as the service being unreachable. Anyone wanting to query the corpus can
// do so directly and for free, so there is nothing here worth rationing from
// them, only bandwidth worth rationing from us.
export const PWNED_LOOKUP_LIMIT = { window: 60 * 60, max: 60 }

export function passwordRangeQuery(password: string) {
  const digest = createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase()

  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) }
}

/**
 * How many breaches the suffix appears in, or 0. Padded responses carry decoy
 * suffixes with a count of zero, so a match is only real above it.
 */
export function countFromRange(body: string, suffix: string) {
  for (const line of body.split("\n")) {
    const [candidate, count] = line.trim().split(":")
    if (candidate === suffix) return Number.parseInt(count ?? "0", 10) || 0
  }

  return 0
}

/**
 * Resolves null when the answer is unknown, which is treated as "not breached".
 * A third party this instance cannot reach must not become an outage of its own
 * sign-up, and an attacker cannot arrange that unreachability anyway.
 */
export async function pwnedPasswordCount(password: string) {
  if (!env.security.checkPwnedPasswords) return null

  const { prefix, suffix } = passwordRangeQuery(password)

  try {
    const response = await fetch(`${ENDPOINT}/${prefix}`, {
      // Pads the response to a uniform size so its length says nothing.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) return null

    return countFromRange(await response.text(), suffix)
  } catch {
    return null
  }
}

export type BreachVerdict = { ok: true } | { ok: false; error: string }

/**
 * The whole check, budget included, so every caller enforces it the same way.
 *
 * Running out of budget refuses the request rather than skipping the lookup.
 * Skipping would make the check optional to anyone willing to spend sixty
 * throwaway submissions first, and then register the breached password they
 * came for. The budget is a caller's to exhaust, unlike the network.
 */
export async function checkPasswordAgainstBreaches(
  password: string,
  source: string | null
): Promise<BreachVerdict> {
  if (!env.security.checkPwnedPasswords) return { ok: true }

  const budget = await consumeRateLimit(
    `pwned-lookup:${source ?? "unknown"}`,
    PWNED_LOOKUP_LIMIT
  )
  if (!budget.allowed) {
    return {
      ok: false,
      error: `Too many attempts. Try again in ${Math.ceil((budget.retryAfter ?? 60) / 60)} minutes.`,
    }
  }

  const count = await pwnedPasswordCount(password)
  if (count === null || count === 0) return { ok: true }

  return {
    ok: false,
    error:
      "This password has appeared in a data breach. Choose a different one.",
  }
}
