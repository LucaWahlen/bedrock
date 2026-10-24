import { afterAll, describe, expect, test } from "bun:test"

import { eq, inArray } from "drizzle-orm"

import { userAvatarKey } from "@/features/account/lib/avatar-storage"
import { findSoleOwnedOrganizations } from "@/features/account/lib/sole-ownership"
import {
  createChangeEmailSchema,
  createChangePasswordSchema,
  createDeleteAccountSchema,
  createUpdateProfileInputSchema,
} from "@/features/account/schemas/account"
import type { DeviceType } from "@/features/account/types"
import { soleOwnedOrganizations } from "@/features/account/utils/sole-ownership"
import { describeUserAgent } from "@/features/account/utils/user-agent"
import { navigationFor } from "@/features/app/lib/navigation"
import { auditScopeOf } from "@/features/audit/lib/record-audit-event"
import { emailChangeOf } from "@/features/auth/utils/email-change-token"
import { db } from "@/features/shared/lib/db/client"
import { member, organization, user } from "@/features/shared/lib/db/schema"
import { translatorFor } from "@/features/shared/lib/i18n/translator"

function encodeSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function token(payload: Record<string, unknown>) {
  return `${encodeSegment({ alg: "HS256" })}.${encodeSegment(payload)}.signature`
}

const accountMessages = translatorFor("en", "account")
const changeEmailSchema = createChangeEmailSchema(accountMessages)
const changePasswordSchema = createChangePasswordSchema(accountMessages)
const deleteAccountSchema = createDeleteAccountSchema(accountMessages)
const updateProfileInputSchema = createUpdateProfileInputSchema(accountMessages)

// The navigation holds message keys; read them as an English reader would.
const navigationMessages = translatorFor("en", "app.navigation")

function titles(groups: ReturnType<typeof navigationFor>) {
  return groups.flatMap((group) =>
    group.items.map((item) => navigationMessages(`items.${item.key}`))
  )
}

describe("describing a session's device", () => {
  test.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      "Chrome on macOS",
      "desktop",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
      "Edge on Windows",
      "desktop",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
      "Firefox on Linux",
      "desktop",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari on iOS",
      "mobile",
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1",
      "Chrome on iPadOS",
      "tablet",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      "Chrome on Android",
      "mobile",
    ],
    [
      "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36",
      "Samsung Internet on Android",
      "tablet",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      "Safari on macOS",
      "desktop",
    ],
    ["curl/8.7.1", "curl", "unknown"],
  ])("%p", (userAgent, label, type) => {
    const device = describeUserAgent(userAgent)
    expect(device.label).toBe(label)
    expect(device.type).toBe(type as DeviceType)
  })

  test("a missing user agent is an unknown device", () => {
    expect(describeUserAgent(null)).toEqual({
      browser: null,
      os: null,
      type: "unknown",
      label: "Unknown device",
    })
    expect(describeUserAgent("   ").label).toBe("Unknown device")
  })

  test("an unrecognised browser still names the system", () => {
    expect(describeUserAgent("SomeClient/1.0 (Windows NT 10.0)").label).toBe(
      "Windows device"
    )
  })
})

describe("what the account forms accept", () => {
  test("a new address is trimmed and lowercased", () => {
    const parsed = changeEmailSchema.parse({
      newEmail: "  Jane.Doe@Example.COM ",
      currentPassword: "x",
    })
    expect(parsed.newEmail).toBe("jane.doe@example.com")
  })

  test("refuses an address that is not one", () => {
    expect(
      changeEmailSchema.safeParse({ newEmail: "nope", currentPassword: "x" })
        .success
    ).toBe(false)
  })

  test("refuses an address change without the password", () => {
    expect(
      changeEmailSchema.safeParse({
        newEmail: "a@example.com",
        currentPassword: "",
      }).success
    ).toBe(false)
  })

  test("refuses deletion without the password", () => {
    expect(deleteAccountSchema.safeParse({ currentPassword: "" }).success).toBe(
      false
    )
  })

  test("refuses a new password equal to the current one", async () => {
    const parsed = await changePasswordSchema.safeParseAsync({
      currentPassword: "correct horse battery staple",
      password: "correct horse battery staple",
    })
    expect(parsed.success).toBe(false)
  })

  test("refuses a guessable new password", async () => {
    const parsed = await changePasswordSchema.safeParseAsync({
      currentPassword: "old",
      password: "password1",
    })
    expect(parsed.success).toBe(false)
  })

  test("refuses a password built from the account's own name", async () => {
    const parsed = await changePasswordSchema.safeParseAsync({
      currentPassword: "old",
      password: "jonathanpemberton",
      name: "Jonathan Pemberton",
      email: "jonathan.pemberton@example.com",
    })
    expect(parsed.success).toBe(false)
  })

  test("accepts a strong password and signs out others by default", async () => {
    const parsed = await changePasswordSchema.safeParseAsync({
      currentPassword: "old",
      password: "violet-anchor-tundra-quill-82",
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.revokeOtherSessions).toBe(true)
  })

  test("refuses an empty name", () => {
    expect(
      updateProfileInputSchema.safeParse({
        name: "   ",
        avatar: { action: "keep" },
      }).success
    ).toBe(false)
  })
})

describe("whose avatar a stored URL names", () => {
  const storage = "https://cdn.example.test/bedrock"
  const key =
    "users/usr_1/avatar/avatar-11111111-2222-4333-8444-555555555555.png"

  test("the user's own avatar", () => {
    expect(userAvatarKey("usr_1", `${storage}/${key}`, storage)).toBe(key)
  })

  test("refuses another user's avatar", () => {
    expect(userAvatarKey("usr_2", `${storage}/${key}`, storage)).toBeNull()
  })

  test.each([
    `https://elsewhere.test/bedrock/${key}`,
    `${storage}/users/usr_1/avatar/../../usr_2/avatar/avatar-11111111-2222-4333-8444-555555555555.png`,
    `${storage}/organizations/org_1/branding/logo-11111111-2222-4333-8444-555555555555.png`,
    `${storage}/users/usr_1/avatar/anything.png`,
    `${storage}/users/usr_1/avatar/avatar-11111111-2222-4333-8444-555555555555.svg`,
  ])("refuses %p", (url) => {
    expect(userAvatarKey("usr_1", url, storage)).toBeNull()
  })
})

describe("which organizations would be left without an owner", () => {
  const owners = [
    {
      organizationId: "b",
      organizationName: "Beta",
      organizationSlug: "beta",
      userId: "me",
    },
    {
      organizationId: "a",
      organizationName: "Alpha",
      organizationSlug: "alpha",
      userId: "me",
    },
    {
      organizationId: "c",
      organizationName: "Gamma",
      organizationSlug: "gamma",
      userId: "me",
    },
    {
      organizationId: "c",
      organizationName: "Gamma",
      organizationSlug: "gamma",
      userId: "you",
    },
  ]

  test("only those where nobody else owns them, by name", () => {
    expect(soleOwnedOrganizations(owners, "me")).toEqual([
      { id: "a", name: "Alpha", slug: "alpha" },
      { id: "b", name: "Beta", slug: "beta" },
    ])
  })

  test("nothing for someone who owns nothing alone", () => {
    expect(soleOwnedOrganizations(owners, "you")).toEqual([])
    expect(soleOwnedOrganizations([], "me")).toEqual([])
  })
})

describe("an address-change link", () => {
  test("names both addresses", () => {
    expect(
      emailChangeOf(
        token({ email: "old@example.com", updateTo: "new@example.com" })
      )
    ).toEqual({ from: "old@example.com", to: "new@example.com" })
  })

  test("a plain confirmation is not one", () => {
    expect(emailChangeOf(token({ email: "old@example.com" }))).toBeNull()
    expect(emailChangeOf("not-a-token")).toBeNull()
    expect(emailChangeOf("a.%%%.c")).toBeNull()
  })
})

describe("account events", () => {
  test("belong to the instance even when an organization is named", () => {
    expect(
      auditScopeOf({
        action: "account.deleted",
        actor: { type: "user", userId: "u" },
        organization: { id: "org" },
      })
    ).toBe("platform")
  })
})

describe("the navigation a capability set reaches", () => {
  test("a plain member sees only the overview", () => {
    expect(titles(navigationFor(false, ["overview"]))).toEqual(["Overview"])
    expect(titles(navigationFor(true, ["overview"]))).toEqual(["Overview"])
  })

  test("a tenant administrator sees every tenant page", () => {
    expect(
      titles(
        navigationFor(false, [
          "overview",
          "manageOrganization",
          "manageAuthentication",
          "viewAuditLog",
        ])
      )
    ).toEqual([
      "Overview",
      "Members",
      "Applications",
      "Groups",
      "Roles & permissions",
      "Authentication",
      "Usage",
      "Audit log",
      "Settings",
    ])
  })

  test("instance pages need instance administration", () => {
    expect(
      titles(navigationFor(true, ["overview", "manageOrganization"]))
    ).not.toContain("Organizations")
    expect(
      titles(
        navigationFor(true, [
          "overview",
          "manageOrganization",
          "viewAuditLog",
          "manageAuthentication",
          "administerInstance",
        ])
      )
    ).toEqual([
      "Overview",
      "Organizations",
      "Members",
      "Directory",
      "Applications",
      "Audit log",
      "Health",
      "Usage",
    ])
  })
})

// Runs against the development database and removes every row it creates. Two
// people and three organizations: one each owns alone, one they share, and one
// that has been deleted.
describe("sole ownership in the database", () => {
  const suffix = crypto.randomUUID().slice(0, 8)
  const now = new Date()
  const alice = `test-usr-${suffix}-alice`
  const bob = `test-usr-${suffix}-bob`
  const aliceOnly = `test-org-${suffix}-alice`
  const shared = `test-org-${suffix}-shared`
  const gone = `test-org-${suffix}-gone`
  const bobOnly = `test-org-${suffix}-bob`
  const organizations = [aliceOnly, shared, gone, bobOnly]

  const ready = (async () => {
    await db.insert(user).values(
      [alice, bob].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      }))
    )
    await db.insert(organization).values(
      organizations.map((id) => ({
        id,
        name: id,
        slug: id,
        createdAt: now,
        status: id === gone ? ("deleted" as const) : ("active" as const),
        deletedAt: id === gone ? now : null,
      }))
    )
    await db.insert(member).values([
      {
        id: `${aliceOnly}-a`,
        organizationId: aliceOnly,
        userId: alice,
        role: "owner",
        createdAt: now,
      },
      {
        id: `${aliceOnly}-b`,
        organizationId: aliceOnly,
        userId: bob,
        role: "admin",
        createdAt: now,
      },
      {
        id: `${shared}-a`,
        organizationId: shared,
        userId: alice,
        role: "owner",
        createdAt: now,
      },
      {
        id: `${shared}-b`,
        organizationId: shared,
        userId: bob,
        role: "admin,owner",
        createdAt: now,
      },
      {
        id: `${gone}-a`,
        organizationId: gone,
        userId: alice,
        role: "owner",
        createdAt: now,
      },
      {
        id: `${bobOnly}-b`,
        organizationId: bobOnly,
        userId: bob,
        role: "owner",
        createdAt: now,
      },
      {
        id: `${bobOnly}-a`,
        organizationId: bobOnly,
        userId: alice,
        role: "member",
        createdAt: now,
      },
    ])
  })()

  afterAll(async () => {
    await db.delete(member).where(inArray(member.organizationId, organizations))
    await db.delete(organization).where(inArray(organization.id, organizations))
    await db.delete(user).where(inArray(user.id, [alice, bob]))
  })

  test("names only the live organizations each person owns alone", async () => {
    await ready

    expect(
      (await findSoleOwnedOrganizations(db, alice)).map(({ id }) => id)
    ).toEqual([aliceOnly])
    expect(
      (await findSoleOwnedOrganizations(db, bob)).map(({ id }) => id)
    ).toEqual([bobOnly])
  })

  test("reads the same under the deletion's lock", async () => {
    await ready

    const locked = await db.transaction((tx) =>
      findSoleOwnedOrganizations(tx, alice, { lock: true })
    )
    expect(locked.map(({ id }) => id)).toEqual([aliceOnly])
  })

  test("two co-owners leaving at once cannot both go", async () => {
    await ready

    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let signalLocked!: () => void
    const locked = new Promise<void>((resolve) => (signalLocked = resolve))

    // Alice is not alone in the shared organization, so she may leave it, and
    // holds the owner rows while she does.
    const first = db.transaction(async (tx) => {
      const sole = await findSoleOwnedOrganizations(tx, alice, { lock: true })
      expect(sole.map(({ id }) => id)).not.toContain(shared)
      await tx.delete(member).where(eq(member.id, `${shared}-a`))
      signalLocked()
      await held
    })

    await locked
    const second = db.transaction((tx) =>
      findSoleOwnedOrganizations(tx, bob, { lock: true })
    )
    await Bun.sleep(50)
    release()
    await first

    // Bob waited for her, and now sees he is the last owner left.
    expect((await second).map(({ id }) => id)).toContain(shared)
  })

  test("a second owner releases the organization", async () => {
    await ready

    await db
      .update(member)
      .set({ role: "owner" })
      .where(inArray(member.id, [`${aliceOnly}-b`]))

    expect(await findSoleOwnedOrganizations(db, alice)).toEqual([])
  })
})
