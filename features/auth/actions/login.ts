"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { isAccountDisabledError } from "@/features/auth/lib/account-disabled"
import { auth } from "@/features/auth/lib/auth"
import { finishSignIn } from "@/features/auth/lib/finish-sign-in"
import { refuseDisabledSignIn } from "@/features/auth/lib/refuse-disabled-sign-in"
import { createLoginSchema } from "@/features/auth/schemas/login"
import type { LoginCredentials, LoginResult } from "@/features/auth/types"
import { getOrganizationBySlug } from "@/features/organizations"
import { clientAddress } from "@/features/shared/lib/client-address"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import { recordSignIn } from "@/features/shared/lib/telemetry/metrics"

// This action calls `auth.api` directly, which bypasses the rate limiting
// Better Auth installs on its HTTP router, so the limit is applied here.
// The strict counter is keyed on the account and the source together. Keying it
// on the account alone would let anyone lock an owner out of their own account
// by burning the budget from somewhere else.
const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }
const SOURCE_LIMIT = { window: 15 * 60, max: 30 }

export async function login(
  credentials: LoginCredentials,
  organizationSlug?: string
): Promise<LoginResult> {
  const t = await getTranslations("auth")
  const parsedCredentials = createLoginSchema(t).safeParse(credentials)
  if (!parsedCredentials.success) {
    return { success: false, error: t("errors.invalidCredentials") }
  }

  // Resolved before signing in so a failed attempt can be scoped to the tenant.
  const target = organizationSlug
    ? await getOrganizationBySlug(organizationSlug)
    : undefined
  const auditedOrganization = target
    ? { id: target.id, name: target.name, slug: target.slug }
    : undefined

  const email = parsedCredentials.data.email.toLowerCase()
  const requestHeaders = await headers()
  // Best-effort proxy header, see client-address.ts. Without one, every caller
  // shares one bucket.
  const source = clientAddress(requestHeaders)
  const accountSourceKey = `login:account-source:${email}|${source ?? "unknown"}`
  const attempts = await Promise.all([
    consumeRateLimit(accountSourceKey, ACCOUNT_SOURCE_LIMIT),
    source
      ? consumeRateLimit(`login:source:${source}`, SOURCE_LIMIT)
      : { allowed: true, retryAfter: null },
  ])
  const blocked = attempts.find((attempt) => !attempt.allowed)

  if (blocked) {
    recordSignIn("rate_limited", "password")
    await recordAuditEvent({
      action: "authentication.login",
      outcome: "denied",
      actor: { type: "anonymous", email },
      organization: auditedOrganization,
      reason: "Too many sign-in attempts",
    })

    return {
      success: false,
      error: t("errors.tooManyAttempts", {
        minutes: Math.ceil((blocked.retryAfter ?? 60) / 60),
      }),
    }
  }

  try {
    const signIn = await auth.api.signInEmail({
      body: parsedCredentials.data,
      headers: requestHeaders,
      returnHeaders: true,
    })

    // This source proved it knows the password, so it starts clean again. The
    // source budget stays, or one valid account would clear it for the rest.
    await resetRateLimit(accountSourceKey)

    // The two-factor plugin has already deleted the session the password
    // created and left only a pending challenge, which grants nothing. The gate
    // runs once the second factor is in, on the session that creates.
    if ("twoFactorRedirect" in signIn.response) {
      const context = await auth.$context
      const challenged = await context.internalAdapter.findUserByEmail(email)
      await recordAuditEvent({
        action: "authentication.two_factor_challenged",
        actor: challenged
          ? auditActorFromUser(challenged.user)
          : { type: "anonymous", email },
        organization: auditedOrganization,
      })

      return { success: true, next: "two-factor" }
    }

    return await finishSignIn({
      signIn: {
        user: signIn.response.user,
        sessionToken: signIn.response.token,
        setCookieHeaders: signIn.headers.getSetCookie(),
      },
      target,
      method: "password",
    })
  } catch (error) {
    // Only a rejected credential is an attempt. A database or provider fault is
    // neither a sign-in attempt to log nor a message to show the browser.
    if (!(error instanceof APIError)) throw error

    // The password was right, which is what lets the account be named here.
    if (isAccountDisabledError(error)) {
      const context = await auth.$context
      const refused = await context.internalAdapter.findUserByEmail(email)

      return refuseDisabledSignIn({
        actor: refused
          ? auditActorFromUser(refused.user)
          : { type: "anonymous", email },
        organization: auditedOrganization,
        method: "password",
      })
    }

    recordSignIn("failure", "password")
    await recordAuditEvent({
      action: "authentication.login",
      outcome: "failure",
      // The credentials did not identify anyone, so only the attempt is known.
      actor: { type: "anonymous", email: parsedCredentials.data.email },
      organization: auditedOrganization,
      reason: error.body?.message ?? error.message,
    })

    // Deliberately generic, so a wrong password cannot confirm an account.
    return { success: false, error: t("errors.invalidCredentials") }
  }
}
