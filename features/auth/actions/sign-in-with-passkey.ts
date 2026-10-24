"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { isAccountDisabledError } from "@/features/auth/lib/account-disabled"
import { auth } from "@/features/auth/lib/auth"
import { finishSignIn } from "@/features/auth/lib/finish-sign-in"
import { refuseDisabledSignIn } from "@/features/auth/lib/refuse-disabled-sign-in"
import { passkeyAuthenticationResponseSchema } from "@/features/auth/schemas/passkey"
import type { PasskeySignInResult } from "@/features/auth/types"
import { getOrganizationBySlug } from "@/features/organizations"
import { clientAddress } from "@/features/shared/lib/client-address"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import { recordSignIn } from "@/features/shared/lib/telemetry/metrics"

// The login form's source budget: a passkey is one more way to try signing in
// from the same place, not a separate allowance. There is no account to key a
// stricter limit on until the signature has been checked.
const SOURCE_LIMIT = { window: 15 * 60, max: 30 }

const METADATA = { method: "passkey" }

async function passkeyOwner(credentialId: string) {
  const context = await auth.$context
  const credential = await context.adapter.findOne<{ userId: string }>({
    model: "passkey",
    where: [{ field: "credentialID", value: credentialId }],
  })
  const owner = credential
    ? await context.internalAdapter.findUserById(credential.userId)
    : null

  return auditActorFromUser(owner)
}

/**
 * Signs in with a passkey. Possession of the key and the user verification the
 * authenticator performs are both factors, so no second factor is asked for;
 * the session it creates still passes the same gate as a password sign-in.
 */
export async function signInWithPasskey(
  credential: unknown,
  organizationSlug?: string
): Promise<PasskeySignInResult> {
  const t = await getTranslations("auth")
  const parsed = passkeyAuthenticationResponseSchema.safeParse(credential)
  if (!parsed.success) {
    return { success: false, error: t("errors.passkeyFailed") }
  }

  const target = organizationSlug
    ? await getOrganizationBySlug(organizationSlug)
    : undefined
  const auditedOrganization = target
    ? { id: target.id, name: target.name, slug: target.slug }
    : undefined

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  if (source) {
    const throttle = await consumeRateLimit(
      `login:source:${source}`,
      SOURCE_LIMIT
    )
    if (!throttle.allowed) {
      recordSignIn("rate_limited", "passkey")
      await recordAuditEvent({
        action: "authentication.login",
        outcome: "denied",
        actor: { type: "anonymous" },
        organization: auditedOrganization,
        reason: "Too many sign-in attempts",
        metadata: METADATA,
      })

      return {
        success: false,
        error: t("errors.tooManyAttempts", {
          minutes: Math.ceil((throttle.retryAfter ?? 60) / 60),
        }),
      }
    }
  }

  try {
    const verified = await auth.api.verifyPasskeyAuthentication({
      body: { response: parsed.data },
      headers: requestHeaders,
      returnHeaders: true,
    })
    const { session, user } = verified.response

    return await finishSignIn({
      signIn: {
        user,
        sessionToken: session.token,
        setCookieHeaders: verified.headers.getSetCookie(),
      },
      target,
      method: "passkey",
      metadata: METADATA,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    // The signature checked out, so the credential names its owner.
    if (isAccountDisabledError(error)) {
      return refuseDisabledSignIn({
        actor: await passkeyOwner(parsed.data.id),
        organization: auditedOrganization,
        method: "passkey",
        metadata: METADATA,
      })
    }

    recordSignIn("failure", "passkey")
    await recordAuditEvent({
      action: "authentication.login",
      outcome: "failure",
      // The credential did not identify anyone it could be trusted for.
      actor: { type: "anonymous" },
      organization: auditedOrganization,
      reason: error.body?.message ?? error.message,
      metadata: METADATA,
    })

    return { success: false, error: t("errors.passkeySignInFailed") }
  }
}
