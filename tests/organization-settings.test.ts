import { describe, expect, test } from "bun:test"

import { organizationBrandingKey } from "@/features/organizations/lib/branding-storage"
import {
  createOrganizationProfileSchema,
  createOrganizationSlugFormSchema,
} from "@/features/organizations/schemas/update-organization"
import { translatorFor } from "@/features/shared/lib/i18n/translator"
import { isOwnedStagedBrandingKey } from "@/features/shared/lib/storage/media"

const t = translatorFor("en", "organizations")
const organizationProfileSchema = createOrganizationProfileSchema(t)
const organizationSlugFormSchema = createOrganizationSlugFormSchema(t)

const STORAGE_URL = "https://cdn.example.test/bedrock"
const ORGANIZATION_ID = "org_1"
const LOGO_KEY = `organizations/${ORGANIZATION_ID}/branding/logo-11111111-2222-4333-8444-555555555555.png`

function mediaFile(type: string, size: number, name = "logo.png") {
  const file = new File([new Uint8Array(1)], name, { type })
  // A File built in a test cannot carry megabytes, so the size is stated.
  Object.defineProperty(file, "size", { value: size })
  return file
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    name: "Acme Inc.",
    color: "#3e86ff",
    logo: { action: "keep" },
    backgroundImage: { action: "keep" },
    favicon: { action: "keep" },
    ...overrides,
  }
}

// The settings blocks and the update action share these schemas, so a rule that
// is wrong here is wrong on both sides of the request.
describe("what a settings save accepts", () => {
  test("an unchanged organization", () => {
    expect(organizationProfileSchema.safeParse(profile()).success).toBe(true)
  })

  test.each(["Acme Inc", "acme inc", "acme--inc", "-acme", "ACME"])(
    "refuses %p as a slug",
    (slug) => {
      expect(organizationSlugFormSchema.safeParse({ slug }).success).toBe(false)
    }
  )

  test("accepts a lowercase hyphenated slug", () => {
    expect(
      organizationSlugFormSchema.safeParse({ slug: "acme-inc" }).success
    ).toBe(true)
  })

  test("refuses a colour that is not six hex digits", () => {
    expect(
      organizationProfileSchema.safeParse(profile({ color: "#fff" })).success
    ).toBe(false)
  })

  test("accepts no colour at all", () => {
    expect(
      organizationProfileSchema.safeParse(profile({ color: "" })).success
    ).toBe(true)
  })

  test.each([
    ["keep", { action: "keep" }],
    ["remove", { action: "remove" }],
    ["replace", { action: "replace", file: mediaFile("image/png", 1024) }],
  ])("accepts %s for an image", (_name, logo) => {
    expect(organizationProfileSchema.safeParse(profile({ logo })).success).toBe(
      true
    )
  })

  test("refuses a replacement of the wrong type", () => {
    const logo = { action: "replace", file: mediaFile("image/gif", 1024) }
    expect(organizationProfileSchema.safeParse(profile({ logo })).success).toBe(
      false
    )
  })

  test("refuses a replacement over the size limit", () => {
    const logo = {
      action: "replace",
      file: mediaFile("image/png", 3 * 1024 * 1024),
    }
    expect(organizationProfileSchema.safeParse(profile({ logo })).success).toBe(
      false
    )
  })

  test("refuses a replacement with no file", () => {
    expect(
      organizationProfileSchema.safeParse(
        profile({ logo: { action: "replace" } })
      ).success
    ).toBe(false)
  })
})

// Replacing branding deletes the object it replaced, so this is the only thing
// standing between a tampered column and another organization's files.
describe("which stored image an organization may delete", () => {
  test("its own branding object", () => {
    expect(
      organizationBrandingKey(
        ORGANIZATION_ID,
        `${STORAGE_URL}/${LOGO_KEY}`,
        STORAGE_URL
      )
    ).toBe(LOGO_KEY)
  })

  test("a trailing slash on the storage url makes no difference", () => {
    expect(
      organizationBrandingKey(
        ORGANIZATION_ID,
        `${STORAGE_URL}/${LOGO_KEY}`,
        `${STORAGE_URL}/`
      )
    ).toBe(LOGO_KEY)
  })

  test("refuses another organization's branding", () => {
    const key = LOGO_KEY.replace(ORGANIZATION_ID, "org_2")
    expect(
      organizationBrandingKey(
        ORGANIZATION_ID,
        `${STORAGE_URL}/${key}`,
        STORAGE_URL
      )
    ).toBeNull()
  })

  test("refuses a staging upload", () => {
    const key = "staging/organization-branding/user_1/logo.png"
    expect(
      organizationBrandingKey(
        ORGANIZATION_ID,
        `${STORAGE_URL}/${key}`,
        STORAGE_URL
      )
    ).toBeNull()
  })

  test("refuses an escape from the branding prefix", () => {
    const key = `organizations/${ORGANIZATION_ID}/branding/..%2F..%2Fother.png`
    expect(
      organizationBrandingKey(
        ORGANIZATION_ID,
        `${STORAGE_URL}/${key}`,
        STORAGE_URL
      )
    ).toBeNull()
  })

  test("refuses a url from somewhere else entirely", () => {
    expect(
      organizationBrandingKey(
        ORGANIZATION_ID,
        `https://evil.test/${LOGO_KEY}`,
        STORAGE_URL
      )
    ).toBeNull()
  })

  test("refuses a name that is not a generated branding object", () => {
    const key = `organizations/${ORGANIZATION_ID}/branding/logo.png`
    expect(
      organizationBrandingKey(
        ORGANIZATION_ID,
        `${STORAGE_URL}/${key}`,
        STORAGE_URL
      )
    ).toBeNull()
  })
})

// The staging prefix is the only boundary between one user's uploads and
// another's, and both the delete route and promotion rest on it.
describe("which staged upload a user owns", () => {
  const OWNED = `staging/organization-branding/user_1/11111111-2222-4333-8444-555555555555.png`

  test("its own upload", () => {
    expect(isOwnedStagedBrandingKey(OWNED, "user_1")).toBe(true)
  })

  test("refuses another user's upload", () => {
    expect(isOwnedStagedBrandingKey(OWNED, "user_2")).toBe(false)
  })

  test("refuses a nested key under its own prefix", () => {
    const key = OWNED.replace("user_1/", "user_1/nested/")
    expect(isOwnedStagedBrandingKey(key, "user_1")).toBe(false)
  })

  test("refuses a name that is not a generated staging object", () => {
    const key = "staging/organization-branding/user_1/logo.png"
    expect(isOwnedStagedBrandingKey(key, "user_1")).toBe(false)
  })

  test("refuses a user id that merely prefixes another", () => {
    expect(
      isOwnedStagedBrandingKey(OWNED.replace("user_1", "user_10"), "user_1")
    ).toBe(false)
  })
})
