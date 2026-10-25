import { metrics, trace } from "@opentelemetry/api"

// Only the API is imported here. Without a registered provider every
// instrument is a no-op, so callers never check whether telemetry is on.

export type SignInOutcome = "success" | "failure" | "denied" | "rate_limited"

export type SignInMethod = "password" | "passkey"

export type EmailOutcome = "success" | "failure"

export type RequestErrorContext = {
  method: string
  routePath: string
  routeType: string
}

function createInstruments() {
  const meter = metrics.getMeter("bedrock")

  return {
    signIns: meter.createCounter("bedrock.auth.sign_ins", {
      description: "Sign-in attempts by outcome and method",
    }),
    emailsSent: meter.createCounter("bedrock.email.sent", {
      description: "Messages handed to the email transport, by outcome",
    }),
    tokensIssued: meter.createCounter("bedrock.oidc.tokens_issued", {
      description: "Successful responses from the OpenID token endpoint",
    }),
    tokensRefused: meter.createCounter("bedrock.oidc.tokens_refused", {
      description: "Refused token requests, by OAuth error and grant type",
    }),
    requestErrors: meter.createCounter("bedrock.request.errors", {
      description: "Errors captured by Next.js while serving a request",
    }),
  }
}

let instruments: ReturnType<typeof createInstruments> | undefined

// Created on first use rather than at import, so they bind to the provider
// `instrumentation.ts` registers instead of the no-op one before it.
function getInstruments() {
  instruments ??= createInstruments()
  return instruments
}

export function recordSignIn(outcome: SignInOutcome, method: SignInMethod) {
  getInstruments().signIns.add(1, { outcome, method })
}

export function recordEmailSent(outcome: EmailOutcome) {
  getInstruments().emailsSent.add(1, { outcome })
}

export function recordTokenIssued() {
  getInstruments().tokensIssued.add(1)
}

export function recordTokenRefused(error: string, grantType: string) {
  getInstruments().tokensRefused.add(1, {
    "oauth.error": error,
    "oauth.grant_type": grantType,
  })
}

/**
 * Records where a request failed, never what it carried: the route pattern
 * rather than the path, which may hold tokens in its query, and the error's
 * class rather than its message, which may quote user input.
 */
export function recordRequestError(
  error: unknown,
  context: RequestErrorContext
) {
  const errorType = error instanceof Error ? error.name : typeof error

  getInstruments().requestErrors.add(1, {
    "http.request.method": context.method,
    "http.route": context.routePath,
    "next.route_type": context.routeType,
    "error.type": errorType,
  })

  trace.getActiveSpan()?.setAttribute("error.type", errorType)
}
