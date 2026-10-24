import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { eq, inArray } from "drizzle-orm"

import {
  createApplicationSchema,
  oauthApplicationType,
} from "@/features/applications/schemas/application"
import { scopeIncludesOpenId } from "@/features/auth/lib/oidc-authorization-gate"
import { db } from "@/features/shared/lib/db/client"
import {
  member,
  oauthClient,
  organization,
  user,
} from "@/features/shared/lib/db/schema"
import { translatorFor } from "@/features/shared/lib/i18n/translator"
import { authorizationRefusal } from "@/features/shared/lib/oidc-claims"

const applicationSchema = createApplicationSchema(
  translatorFor("en", "applications")
)

// The gate in front of `/oauth2/authorize` and `/oauth2/consent`. The claim
// callbacks only run when a token carries claims, so this is the check that
// holds for every code the provider issues.

const suffix = crypto.randomUUID().slice(0, 8)
const id = (name: string) => `oidc-gate-${suffix}-${name}`

const ownOrgId = id("own")
const otherOrgId = id("other")
const aliceId = id("alice")
const bobId = id("bob")
const ownClientId = id("own-app")
const otherClientId = id("other-app")

beforeAll(async () => {
  const now = new Date()

  await db.insert(user).values(
    [aliceId, bobId].map((userId) => ({
      id: userId,
      name: userId,
      email: `${userId}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }))
  )
  await db.insert(organization).values(
    [ownOrgId, otherOrgId].map((organizationId) => ({
      id: organizationId,
      name: organizationId,
      slug: organizationId,
      createdAt: now,
    }))
  )
  await db.insert(oauthClient).values([
    {
      id: ownClientId,
      clientId: ownClientId,
      redirectUris: ["https://own.example.test/callback"],
      referenceId: ownOrgId,
      createdAt: now,
    },
    {
      id: otherClientId,
      clientId: otherClientId,
      redirectUris: ["https://other.example.test/callback"],
      referenceId: otherOrgId,
      createdAt: now,
    },
  ])
  await db.insert(member).values([
    {
      id: id("alice-own"),
      organizationId: ownOrgId,
      userId: aliceId,
      role: "member",
      createdAt: now,
    },
    {
      id: id("bob-other"),
      organizationId: otherOrgId,
      userId: bobId,
      role: "owner",
      createdAt: now,
    },
  ])
})

afterAll(async () => {
  await db
    .delete(organization)
    .where(inArray(organization.id, [ownOrgId, otherOrgId]))
  await db.delete(user).where(inArray(user.id, [aliceId, bobId]))
})

describe("who may be issued a code", () => {
  test("a member of the organization owning the application", async () => {
    expect(await authorizationRefusal(aliceId, ownClientId)).toBeNull()
    expect(await authorizationRefusal(bobId, otherClientId)).toBeNull()
  })

  // Signed in is not enough: each is a stranger to the other's application.
  test("not a member of another organization's application", async () => {
    expect(await authorizationRefusal(aliceId, otherClientId)).toEqual({
      reason: "not_member",
      organizationSlug: otherOrgId,
    })
    expect(await authorizationRefusal(bobId, ownClientId)).toEqual({
      reason: "not_member",
      organizationSlug: ownOrgId,
    })
  })

  test("nobody, while the organization is suspended", async () => {
    await db
      .update(organization)
      .set({ status: "suspended", statusChangedAt: new Date() })
      .where(eq(organization.id, ownOrgId))

    expect(await authorizationRefusal(aliceId, ownClientId)).toEqual({
      reason: "inactive_organization",
    })

    await db
      .update(organization)
      .set({ status: "active" })
      .where(eq(organization.id, ownOrgId))
  })

  test("nobody, for an unknown application", async () => {
    expect(await authorizationRefusal(aliceId, id("missing"))).toEqual({
      reason: "unknown_application",
    })
  })
})

describe("which scopes the gate lets through", () => {
  test("anything that includes openid", () => {
    expect(scopeIncludesOpenId("openid profile email roles")).toBe(true)
  })

  // The provider's default scopes include openid.
  test("no scope at all", () => {
    expect(scopeIncludesOpenId(undefined)).toBe(true)
    expect(scopeIncludesOpenId(null)).toBe(true)
  })

  // Without openid no claim callback runs, so membership would go unchecked.
  test("not a request without openid", () => {
    expect(scopeIncludesOpenId("profile email")).toBe(false)
    expect(scopeIncludesOpenId("")).toBe(false)
    expect(scopeIncludesOpenId("openidx")).toBe(false)
  })
})

describe("application URLs", () => {
  const valid = {
    name: "Portal",
    redirectUris: ["https://portal.example.test/callback"],
  }

  test("accepts IPv6 loopback over http, with or without a port", () => {
    for (const uri of ["http://[::1]/callback", "http://[::1]:8080/callback"]) {
      expect(
        applicationSchema.safeParse({ ...valid, redirectUris: [uri] }).success
      ).toBe(true)
    }
  })

  test("refuses plain http anywhere but loopback", () => {
    expect(
      applicationSchema.safeParse({
        ...valid,
        redirectUris: ["http://portal.example.test/callback"],
      }).success
    ).toBe(false)
  })

  // The provider refuses https on loopback for every application type.
  test("refuses https on loopback", () => {
    expect(
      applicationSchema.safeParse({
        ...valid,
        redirectUris: ["https://localhost:4180/oauth2/callback"],
      }).success
    ).toBe(false)
  })

  test("registers a loopback redirect as a native client", () => {
    expect(
      oauthApplicationType(["http://localhost:4180/oauth2/callback"])
    ).toBe("native")
    expect(
      oauthApplicationType([
        "https://portal.example.test/callback",
        "http://127.0.0.1:8080/callback",
      ])
    ).toBe("native")
    expect(oauthApplicationType(["https://portal.example.test/callback"])).toBe(
      "web"
    )
  })

  test("refuses a homepage that is not http or https", () => {
    for (const uri of ["javascript:alert(1)", "data:text/html,x"]) {
      expect(applicationSchema.safeParse({ ...valid, uri }).success).toBe(false)
    }
    expect(
      applicationSchema.safeParse({ ...valid, uri: "https://example.test" })
        .success
    ).toBe(true)
  })
})
