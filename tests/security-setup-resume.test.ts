import { describe, expect, test } from "bun:test"

import { authorizeUrl } from "@/features/applications/utils/authorization-query"
import {
  authorizationParameters,
  securitySetupContinueHref,
  securitySetupUrl,
} from "@/features/auth/utils/security-setup-resume"

// An authorization the gate interrupted because the organization requires a
// second factor: where the member is sent, and where "Continue" sends them
// once they have one. Resuming must only ever replay the request at the local
// authorize endpoint, for an application of that same organization.

const request = {
  response_type: "code",
  client_id: "app-a",
  redirect_uri: "https://a.example.test/callback",
  scope: "openid profile",
  state: "xyz",
  code_challenge: "challenge",
  code_challenge_method: "S256",
}

function queryOf(url: string) {
  return Object.fromEntries(new URL(url, "http://localhost").searchParams)
}

describe("the setup page's address", () => {
  test("carries the interrupted authorization", () => {
    const url = securitySetupUrl("acme", authorizationParameters(request))

    expect(url).toStartWith("/org/acme/setup-security?")
    expect(queryOf(url)).toEqual(request)
  })

  test("carries a consent decision's signed query as it came", () => {
    const signed = new URLSearchParams({
      ...request,
      exp: "1700000000",
      sig: "signature",
    })
    const url = securitySetupUrl("acme", authorizationParameters(signed))

    expect(queryOf(url)).toEqual({
      ...request,
      exp: "1700000000",
      sig: "signature",
    })
  })

  test("serializes a claims request and repeated values like the provider", () => {
    const parameters = authorizationParameters({
      client_id: "app-a",
      claims: { id_token: { email: null } },
      resource: ["https://api.example.test", "https://other.example.test"],
      ignored: { not: "a claims request" },
    })

    expect(parameters.get("claims")).toBe('{"id_token":{"email":null}}')
    expect(parameters.getAll("resource")).toHaveLength(2)
    expect(parameters.has("ignored")).toBe(false)
  })

  test("is the bare page without an application or with an oversized query", () => {
    expect(securitySetupUrl("acme")).toBe("/org/acme/setup-security")
    expect(
      securitySetupUrl("acme", new URLSearchParams({ state: "xyz" }))
    ).toBe("/org/acme/setup-security")
    expect(
      securitySetupUrl(
        "acme",
        new URLSearchParams({ client_id: "app-a", state: "x".repeat(5000) })
      )
    ).toBe("/org/acme/setup-security")
  })

  test("encodes the organization's slug", () => {
    expect(securitySetupUrl("a/b")).toBe("/org/a%2Fb/setup-security")
  })
})

describe("continuing", () => {
  test("resumes the authorization at the local endpoint, signature dropped", () => {
    const carried = queryOf(
      securitySetupUrl(
        "acme",
        authorizationParameters(
          new URLSearchParams({ ...request, exp: "1", sig: "s", ba_iat: "1" })
        )
      )
    )

    const continuation = securitySetupContinueHref({
      organizationSlug: "acme",
      applicationOrganizationSlug: "acme",
      authorizeHref: authorizeUrl(carried),
    })

    expect(continuation.resumesAuthorization).toBe(true)
    expect(continuation.href).toStartWith("/api/auth/oauth2/authorize?")
    expect(queryOf(continuation.href)).toEqual(request)
  })

  test("goes to the organization for another organization's application", () => {
    expect(
      securitySetupContinueHref({
        organizationSlug: "acme",
        applicationOrganizationSlug: "globex",
        authorizeHref: authorizeUrl(request),
      })
    ).toEqual({ href: "/org/acme", resumesAuthorization: false })
  })

  test("goes to the organization for an unknown or disabled application", () => {
    expect(
      securitySetupContinueHref({
        organizationSlug: "acme",
        applicationOrganizationSlug: null,
        authorizeHref: null,
      })
    ).toEqual({ href: "/org/acme", resumesAuthorization: false })
  })

  test("never leaves for anywhere but the authorize endpoint", () => {
    for (const authorizeHref of [
      "https://evil.example/api/auth/oauth2/authorize?client_id=app-a",
      "//evil.example/api/auth/oauth2/authorize?client_id=app-a",
      "/api/auth/oauth2/authorize/../../../evil",
    ]) {
      expect(
        securitySetupContinueHref({
          organizationSlug: "acme",
          applicationOrganizationSlug: "acme",
          authorizeHref,
        })
      ).toEqual({ href: "/org/acme", resumesAuthorization: false })
    }
  })
})
