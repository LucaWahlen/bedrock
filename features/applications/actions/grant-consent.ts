"use server"

import { headers } from "next/headers"

import { auth } from "@/features/auth"
import { env } from "@/features/shared/lib/config/env"

export type ConsentResult =
  | { success: true; redirectUri: string }
  | { success: false; error: string }

// The decision itself stays with Better Auth: it verifies the signed
// authorization query, checks the session, and answers with where to send the
// browser. Passing `oauth_query` back is what ties this to the request that
// started the flow.
export async function grantConsent(
  accept: boolean,
  oauthQuery: string
): Promise<ConsentResult> {
  try {
    const requestHeaders = await headers()
    const result = await auth.api.oauth2Consent({
      headers: requestHeaders,
      // Accepting continues into the provider's authorize step, which refuses
      // to run without a request to read the session from. It is this one,
      // carrying the same cookies.
      request: new Request(new URL("/api/auth/oauth2/consent", env.auth.url), {
        method: "POST",
        headers: requestHeaders,
      }),
      // A request alone would make the endpoint answer with a Response.
      asResponse: false,
      body: { accept, oauth_query: oauthQuery },
    })

    if (!("url" in result) || !result.url) {
      return { success: false, error: "Could not complete the sign-in request" }
    }

    return { success: true, redirectUri: result.url }
  } catch {
    // The query is signed and short-lived, so a failure here is usually an
    // expired one. Nothing about the client is worth disclosing.
    return {
      success: false,
      error: "This sign-in request is no longer valid. Start again.",
    }
  }
}
