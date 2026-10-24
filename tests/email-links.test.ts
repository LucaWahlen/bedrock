import { describe, expect, test } from "bun:test"

import {
  invitationTokenFromAuthUrl,
  isInvitationToken,
  organizationCallback,
  organizationSlugFromAuthUrl,
  resetPasswordLink,
} from "@/features/auth/lib/email-links"

// Better Auth builds the URL it hands to the mail hook, and the only thing that
// survives the round trip is the callback we gave it. Everything the mail needs
// to know about the organization, and about an invitation waiting on the other
// side of the reset, has to come back out of that one string.

const TOKEN = "lcitlBUvfLzRb68sOWVXnLvaL5kPv1FClofnml2BHo8"

function authUrl(callback: string) {
  return `http://localhost:3000/api/auth/reset-password/abc?callbackURL=${encodeURIComponent(callback)}`
}

describe("recognising an invitation token", () => {
  test("accepts one this application minted", () => {
    expect(isInvitationToken(TOKEN)).toBe(true)
  })

  test.each([
    ["nothing", undefined],
    ["null", null],
    ["empty", ""],
    ["too short to be one", "abc"],
    ["a path traversal", "../../etc/passwd"],
    ["a url", "https://evil.example/steal"],
    ["a query injection", `${TOKEN}&role=owner`],
  ])("refuses %s", (_name, value) => {
    expect(isInvitationToken(value)).toBe(false)
  })
})

describe("the callback carries the organization", () => {
  test("and nothing else when there is no invitation", () => {
    expect(organizationCallback("acme")).toBe("/org/acme")
  })

  test("and the invitation when there is one", () => {
    expect(organizationCallback("acme", TOKEN)).toBe(
      `/org/acme/invitation?token=${TOKEN}`
    )
  })

  test("but never an invitation it does not recognise", () => {
    expect(organizationCallback("acme", "../../evil")).toBe("/org/acme")
  })
})

describe("reading the callback back out", () => {
  test("the slug, with or without an invitation", () => {
    expect(organizationSlugFromAuthUrl(authUrl("/org/acme"))).toBe("acme")
    expect(
      organizationSlugFromAuthUrl(
        authUrl(`/org/acme/invitation?token=${TOKEN}`)
      )
    ).toBe("acme")
  })

  test("falls back to root rather than trusting a malformed slug", () => {
    expect(organizationSlugFromAuthUrl(authUrl("/org/NOT A SLUG"))).toBe(
      "bedrock"
    )
    expect(organizationSlugFromAuthUrl("not-a-url-at-all")).toBe("bedrock")
  })

  test("the invitation token when one was sent", () => {
    expect(
      invitationTokenFromAuthUrl(authUrl(`/org/acme/invitation?token=${TOKEN}`))
    ).toBe(TOKEN)
  })

  test("nothing when one was not", () => {
    expect(invitationTokenFromAuthUrl(authUrl("/org/acme"))).toBeNull()
    expect(invitationTokenFromAuthUrl("not-a-url-at-all")).toBeNull()
  })
})

describe("the reset link", () => {
  test("carries the invitation, so the reset can return to it", () => {
    expect(resetPasswordLink("acme", "reset-token", TOKEN)).toBe(
      `http://localhost:3000/org/acme/reset-password?token=reset-token&invitation=${TOKEN}`
    )
  })

  test("omits it when there is none", () => {
    expect(resetPasswordLink("acme", "reset-token")).toBe(
      "http://localhost:3000/org/acme/reset-password?token=reset-token"
    )
  })

  test("refuses to put anything unrecognised in a mail", () => {
    expect(resetPasswordLink("acme", "reset-token", "https://evil.test")).toBe(
      "http://localhost:3000/org/acme/reset-password?token=reset-token"
    )
  })
})

// The whole point: an invited person who has forgotten their password ends up
// back at the invitation, not at the login page that refuses a non-member.
test("an invitation survives the trip out through the mail and back", () => {
  const callback = organizationCallback("acme", TOKEN)
  const url = authUrl(callback)

  const link = resetPasswordLink(
    organizationSlugFromAuthUrl(url),
    "reset-token",
    invitationTokenFromAuthUrl(url)
  )

  expect(link).toBe(
    `http://localhost:3000/org/acme/reset-password?token=reset-token&invitation=${TOKEN}`
  )
})
