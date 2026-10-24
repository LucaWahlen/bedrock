import { describe, expect, test } from "bun:test"

import { applicationIconKey } from "@/features/applications/lib/icon-storage"

// A stored URL is just a string in a column. This is what decides whether it
// may be deleted, so a mistake here deletes somebody else's object.
const ORG = "org-1"
const CLIENT = "client-1"
const PUBLIC_URL = "https://media.example.test"

function keyFor(url: string, organizationId = ORG, clientId = CLIENT) {
  return applicationIconKey(organizationId, clientId, url, PUBLIC_URL)
}

const OWN_ICON = `${PUBLIC_URL}/organizations/${ORG}/applications/${CLIENT}/icon-6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f.png`

describe("which icon a deletion may claim", () => {
  test("the application's own", () => {
    expect(keyFor(OWN_ICON)).toBe(
      `organizations/${ORG}/applications/${CLIENT}/icon-6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f.png`
    )
  })

  test("nothing, when there is no icon", () => {
    expect(keyFor("")).toBeNull()
  })
})

describe("which it must refuse", () => {
  test("another organization's", () => {
    expect(keyFor(OWN_ICON, "org-2")).toBeNull()
  })

  test("another application's", () => {
    expect(keyFor(OWN_ICON, ORG, "client-2")).toBeNull()
  })

  test("an object outside the applications prefix", () => {
    expect(
      keyFor(`${PUBLIC_URL}/organizations/${ORG}/branding/logo-abc.png`)
    ).toBeNull()
  })

  test("a URL from somewhere else entirely", () => {
    expect(
      keyFor(
        `https://evil.test/organizations/${ORG}/applications/${CLIENT}/icon-6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f.png`
      )
    ).toBeNull()
  })

  // Traversal would otherwise decode back inside the prefix check.
  test("a traversal dressed up as a filename", () => {
    expect(
      keyFor(
        `${PUBLIC_URL}/organizations/${ORG}/applications/${CLIENT}/..%2F..%2Fbranding%2Flogo.png`
      )
    ).toBeNull()
  })

  test("a filename that is not a generated icon", () => {
    expect(
      keyFor(
        `${PUBLIC_URL}/organizations/${ORG}/applications/${CLIENT}/anything.png`
      )
    ).toBeNull()
  })
})
