import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { headers } from "next/headers"

import { grantConsent } from "@/features/applications/actions/grant-consent"
import { auth } from "@/features/auth/lib/auth"
import { db } from "@/features/shared/lib/db/client"
import { oauthClient } from "@/features/shared/lib/db/schema"
import { createFixture, type Fixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

// The decision on the consent screen, driven with a query the provider really
// signed: accepting issues a code to the application, declining tells it so,
// and nobody outside the application's organization can decide for it.

const REDIRECT_URI = "http://localhost:4455/callback"

let fixture: Fixture
let clientId: string

beforeAll(async () => {
  fixture = await createFixture("consent")
  clientId = `consent-${fixture.suffix}`
  const now = new Date()

  await db.insert(oauthClient).values({
    id: clientId,
    clientId,
    name: "Consent app",
    redirectUris: [REDIRECT_URI],
    applicationType: "native",
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    skipConsent: false,
    requirePKCE: true,
    referenceId: fixture.orgA.id,
    metadata: { clientId, organizationId: fixture.orgA.id },
    createdAt: now,
    updatedAt: now,
  })
})

afterAll(async () => {
  await fixture.cleanup()
})

// What the authorize endpoint hands the consent page for the current caller.
async function signedConsentQuery() {
  const url = new URL("http://localhost:3000/api/auth/oauth2/authorize")
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email",
    state: "consent-state",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    // Asks again even after an earlier test consented.
    prompt: "consent",
  })) {
    url.searchParams.set(key, value)
  }

  const response = await auth.handler(
    new Request(url, { headers: await headers() })
  )
  const location = new URL(
    response.headers.get("location") ?? "",
    "http://localhost:3000"
  )
  expect(location.pathname).toBe("/oauth2/consent")

  return location.search.slice(1)
}

describe("deciding on consent", () => {
  test("accepting issues a code to the application", async () => {
    await actAs(fixture.alice)
    const query = await signedConsentQuery()

    const result = await grantConsent(true, query)

    expect(result.success).toBe(true)
    if (!result.success) return
    const redirect = new URL(result.redirectUri)
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REDIRECT_URI)
    expect(redirect.searchParams.get("code")).toBeTruthy()
    expect(redirect.searchParams.get("state")).toBe("consent-state")
  })

  test("declining tells the application it was denied", async () => {
    await actAs(fixture.carol)
    const query = await signedConsentQuery()

    const result = await grantConsent(false, query)

    expect(result.success).toBe(true)
    if (!result.success) return
    const redirect = new URL(result.redirectUri)
    expect(redirect.searchParams.get("error")).toBe("access_denied")
    expect(redirect.searchParams.get("code")).toBeNull()
  })

  // Bob owns the other organization: a query signed for Alice's request does
  // not let him grant this application anything.
  test("someone outside the organization is not issued a code", async () => {
    await actAs(fixture.alice)
    const query = await signedConsentQuery()

    await actAs(fixture.bob)
    const result = await grantConsent(true, query)

    const code = result.success
      ? new URL(result.redirectUri, "http://localhost:3000").searchParams.get(
          "code"
        )
      : null
    expect(code).toBeNull()
  })
})
