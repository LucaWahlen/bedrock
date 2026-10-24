"use server"

import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser"
import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { auth } from "@/features/auth/lib/auth"
import { clientAddress } from "@/features/shared/lib/client-address"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { QueryResult } from "@/features/shared/types"

// Each call stores a challenge, so it is bounded per source. Generous, because
// the login page asks for one on every visit to offer passkeys in autofill.
const SOURCE_LIMIT = { window: 15 * 60, max: 120 }

/**
 * A fresh WebAuthn challenge for signing in with a passkey. The plugin keeps it
 * server-side and hands this browser a signed cookie naming it, which
 * `signInWithPasskey` reads back: one challenge, one browser, five minutes.
 */
export async function getPasskeySignInOptions(): Promise<
  QueryResult<PublicKeyCredentialRequestOptionsJSON>
> {
  const t = await getTranslations("auth")
  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  if (source) {
    const throttle = await consumeRateLimit(
      `passkey:options:source:${source}`,
      SOURCE_LIMIT
    )
    if (!throttle.allowed) {
      return { success: false, error: t("errors.tooManySignInAttemptsLater") }
    }
  }

  try {
    const options = await auth.api.generatePasskeyAuthenticationOptions({
      headers: requestHeaders,
    })

    return {
      success: true,
      data: options as PublicKeyCredentialRequestOptionsJSON,
    }
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    return { success: false, error: t("errors.passkeyUnavailable") }
  }
}
