import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { eq, inArray } from "drizzle-orm"
import { headers } from "next/headers"

import { GET as discoveryRoute } from "@/app/api/auth/.well-known/openid-configuration/route"
import { POST as tokenRoute } from "@/app/api/auth/oauth2/token/route"
import { GET as userinfoRoute } from "@/app/api/auth/oauth2/userinfo/route"
import { GET as avatarRoute } from "@/app/api/avatar/[token]/route"
import { auth } from "@/features/auth/lib/auth"
import { createAvatarToken } from "@/features/shared/lib/avatar-url"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  applicationRoleMember,
  group,
  groupMember,
  member,
  oauthClient,
  organization,
  user,
} from "@/features/shared/lib/db/schema"
import { resolveApplicationAccess } from "@/features/shared/lib/oidc-claims"
import { actAs, forgetSessions } from "@/tests/support/request"

// This is what stands between a valid Bedrock session and a token for someone
// else's application, so it is exercised against the real database rather than
// reasoned about. Everything created here is namespaced and removed afterwards.

const suffix = crypto.randomUUID().slice(0, 8)
const id = (name: string) => `oidc-test-${suffix}-${name}`

const orgId = id("org")
const otherOrgId = id("other-org")
const memberUserId = id("member")
const strangerUserId = id("stranger")
const portalClientId = id("portal")
const wikiClientId = id("wiki")
const ungrantedClientId = id("ungranted")
const membershipId = id("membership")
const sharedRoleId = id("role-shared")
const portalRoleId = id("role-portal")

async function makeUser(userId: string) {
  await db.insert(user).values({
    id: userId,
    name: userId,
    email: `${userId}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function makeOrganization(organizationId: string) {
  await db.insert(organization).values({
    id: organizationId,
    name: organizationId,
    slug: organizationId,
    createdAt: new Date(),
  })
}

async function makeApplication(clientId: string, organizationId: string) {
  await db.insert(oauthClient).values({
    id: clientId,
    clientId,
    name: clientId,
    redirectUris: ["https://example.test/callback"],
    referenceId: organizationId,
    createdAt: new Date(),
  })
}

beforeAll(async () => {
  await makeUser(memberUserId)
  await makeUser(strangerUserId)
  await makeOrganization(orgId)
  await makeOrganization(otherOrgId)
  await makeApplication(portalClientId, orgId)
  await makeApplication(wikiClientId, orgId)
  await makeApplication(ungrantedClientId, orgId)

  await db.insert(member).values({
    id: membershipId,
    organizationId: orgId,
    userId: memberUserId,
    role: "member",
    createdAt: new Date(),
  })

  await db.insert(applicationRole).values([
    {
      id: sharedRoleId,
      organizationId: orgId,
      key: "editor",
      name: "Editor",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: portalRoleId,
      organizationId: orgId,
      key: "billing",
      name: "Billing",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  // "editor" spans both applications; "billing" belongs to the portal alone.
  await db.insert(applicationRoleClient).values([
    { roleId: sharedRoleId, clientId: portalClientId, createdAt: new Date() },
    { roleId: sharedRoleId, clientId: wikiClientId, createdAt: new Date() },
    { roleId: portalRoleId, clientId: portalClientId, createdAt: new Date() },
  ])

  await db.insert(applicationRoleMember).values([
    { roleId: sharedRoleId, memberId: membershipId, createdAt: new Date() },
    { roleId: portalRoleId, memberId: membershipId, createdAt: new Date() },
  ])
})

afterAll(async () => {
  await db
    .delete(organization)
    .where(inArray(organization.id, [orgId, otherOrgId]))
  await db.delete(user).where(inArray(user.id, [memberUserId, strangerUserId]))
})

describe("what an application learns about a member", () => {
  test("the organization that owns it", async () => {
    const access = await resolveApplicationAccess(memberUserId, portalClientId)

    expect(access.organizationSlug).toBe(orgId)
  })

  // The point of a role spanning applications: one name, the same meaning in
  // each of them.
  test("a role attached to two applications appears in both", async () => {
    const portal = await resolveApplicationAccess(memberUserId, portalClientId)
    const wiki = await resolveApplicationAccess(memberUserId, wikiClientId)

    expect(portal.roles).toContain("editor")
    expect(wiki.roles).toContain("editor")
  })

  test("a role attached to one application stays out of the other", async () => {
    const wiki = await resolveApplicationAccess(memberUserId, wikiClientId)

    expect(wiki.roles).not.toContain("billing")
  })
})

describe("who is refused a token", () => {
  test("a member who holds no role on the application", async () => {
    await expect(
      resolveApplicationAccess(memberUserId, ungrantedClientId)
    ).rejects.toThrow(/no role/i)
  })

  test("someone who is not a member of the owning organization", async () => {
    await expect(
      resolveApplicationAccess(strangerUserId, portalClientId)
    ).rejects.toThrow(/not a member/i)
  })

  test("a member of a suspended organization", async () => {
    await db
      .update(organization)
      .set({ status: "suspended", statusChangedAt: new Date() })
      .where(eq(organization.id, orgId))

    await expect(
      resolveApplicationAccess(memberUserId, portalClientId)
    ).rejects.toThrow(/not active/i)

    await db
      .update(organization)
      .set({ status: "active" })
      .where(eq(organization.id, orgId))
  })

  test("an application belonging to no organization", async () => {
    await expect(
      resolveApplicationAccess(memberUserId, "does-not-exist")
    ).rejects.toThrow(/not registered/i)
  })
})

// Roles hang off the membership, so losing the membership loses them without
// anything having to remember to clean up.
describe("when someone leaves the organization", () => {
  test("their roles go with the membership", async () => {
    await db.delete(member).where(eq(member.id, membershipId))

    const remaining = await db
      .select({ roleId: applicationRoleMember.roleId })
      .from(applicationRoleMember)
      .where(eq(applicationRoleMember.memberId, membershipId))

    expect(remaining).toEqual([])

    await expect(
      resolveApplicationAccess(memberUserId, portalClientId)
    ).rejects.toThrow(/not a member/i)
  })
})

describe("claims emitted in ID tokens, userinfo and fallback avatars", () => {
  const BASE = "http://localhost:3000/api/auth"
  const REDIRECT_URI = "https://claims.example.test/callback"
  const VERIFIER = "claims-test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz"

  const claimsOrgA = id("claims-org-a")
  const claimsOrgB = id("claims-org-b")
  const adaId = id("ada")
  const brunoId = id("bruno")
  const clientA = id("claims-client-a")
  const clientB = id("claims-client-b")
  const roleA = id("claims-role-a")
  const roleB = id("claims-role-b")
  const groupA = id("claims-group-a")
  const adaUpdatedAt = new Date("2026-05-10T12:34:56.000Z")
  const uploadedAvatarUrl =
    "https://assets.example.test/users/ada/avatar/avatar-00000000-0000-4000-8000-000000000000.webp"

  let challenge = ""

  beforeAll(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(VERIFIER)
    )
    challenge = Buffer.from(digest).toString("base64url")

    const now = new Date()
    await db.insert(user).values([
      {
        id: adaId,
        name: "Ada Augusta Lovelace",
        email: `${adaId}@example.test`,
        emailVerified: true,
        image: uploadedAvatarUrl,
        locale: "de",
        createdAt: now,
        updatedAt: adaUpdatedAt,
      },
      {
        id: brunoId,
        name: "Bruno Mars",
        email: `${brunoId}@example.test`,
        emailVerified: false,
        image: null,
        locale: null,
        createdAt: now,
        updatedAt: now,
      },
    ])

    await db.insert(organization).values([
      {
        id: claimsOrgA,
        name: "Analytical Engine",
        slug: claimsOrgA,
        createdAt: now,
      },
      {
        id: claimsOrgB,
        name: "Other Tenant",
        slug: claimsOrgB,
        createdAt: now,
      },
    ])

    for (const [clientId, org] of [
      [clientA, claimsOrgA],
      [clientB, claimsOrgB],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await db.insert(oauthClient).values({
        id: clientId,
        clientId,
        name: clientId,
        redirectUris: [REDIRECT_URI],
        applicationType: "web",
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        skipConsent: true,
        requirePKCE: true,
        referenceId: org,
        metadata: { clientId, organizationId: org },
        createdAt: now,
        updatedAt: now,
      })
    }

    const adaMembership = id("ada-mem")
    const brunoMembership = id("bruno-mem")
    await db.insert(member).values([
      {
        id: adaMembership,
        organizationId: claimsOrgA,
        userId: adaId,
        role: "member",
        createdAt: now,
      },
      {
        id: brunoMembership,
        organizationId: claimsOrgB,
        userId: brunoId,
        role: "member",
        createdAt: now,
      },
    ])

    await db.insert(applicationRole).values([
      {
        id: roleA,
        organizationId: claimsOrgA,
        key: "consoleAdmin",
        name: "Console Admin",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: roleB,
        organizationId: claimsOrgB,
        key: "reader",
        name: "Reader",
        createdAt: now,
        updatedAt: now,
      },
    ])
    await db.insert(applicationRoleClient).values([
      { roleId: roleA, clientId: clientA, createdAt: now },
      { roleId: roleB, clientId: clientB, createdAt: now },
    ])
    await db.insert(applicationRoleMember).values([
      { roleId: roleA, memberId: adaMembership, createdAt: now },
      { roleId: roleB, memberId: brunoMembership, createdAt: now },
    ])

    await db.insert(group).values({
      id: groupA,
      organizationId: claimsOrgA,
      key: "platform",
      name: "Platform",
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(groupMember).values({
      groupId: groupA,
      memberId: adaMembership,
      organizationId: claimsOrgA,
      createdAt: now,
    })
  })

  afterAll(async () => {
    forgetSessions([adaId, brunoId])
    await db
      .delete(organization)
      .where(inArray(organization.id, [claimsOrgA, claimsOrgB]))
    await db.delete(user).where(inArray(user.id, [adaId, brunoId]))
  })

  async function issueTokens(
    userId: string,
    clientId: string,
    scope: string,
    extraAuthorizeParams: Record<string, string> = {}
  ) {
    await actAs({ id: userId })
    const authorizeUrl = new URL(`${BASE}/oauth2/authorize`)
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope,
      state: "claims-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...extraAuthorizeParams,
    })) {
      authorizeUrl.searchParams.set(key, value)
    }

    const authorizeResponse = await auth.handler(
      new Request(authorizeUrl, { headers: await headers() })
    )
    const location = new URL(
      authorizeResponse.headers.get("location") ?? "",
      BASE
    )
    const code = location.searchParams.get("code")
    if (!code) throw new Error(`Expected code, received ${location.toString()}`)

    const tokenResponse = await tokenRoute(
      new Request(`${BASE}/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: VERIFIER,
        }),
      })
    )
    expect(tokenResponse.status).toBe(200)
    const tokens = (await tokenResponse.json()) as {
      access_token: string
      id_token: string
    }
    const idTokenClaims = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString()
    ) as Record<string, unknown>

    const userinfoResponse = await userinfoRoute(
      new Request(`${BASE}/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      })
    )
    expect(userinfoResponse.status).toBe(200)
    const userinfo = (await userinfoResponse.json()) as Record<string, unknown>

    return { idTokenClaims, userinfo }
  }

  test("advertises every supported claim in discovery without legacy duplicates", async () => {
    const response = await discoveryRoute(
      new Request(`${BASE}/.well-known/openid-configuration`)
    )
    expect(response.status).toBe(200)
    const metadata = (await response.json()) as { claims_supported: string[] }

    expect(metadata.claims_supported).toEqual(
      expect.arrayContaining([
        "name",
        "given_name",
        "family_name",
        "preferred_username",
        "picture",
        "email",
        "email_verified",
        "organization",
        "roles",
        "groups",
      ])
    )
    expect(
      metadata.claims_supported.some((claim) =>
        claim.startsWith("urn:bedrock:")
      )
    ).toBe(false)
    expect(metadata.claims_supported).not.toContain("locale")
    expect(metadata.claims_supported).not.toContain("updated_at")
  })

  test("emits uploaded picture, profile, email, organization, roles and groups in both ID token and userinfo", async () => {
    const { idTokenClaims, userinfo } = await issueTokens(
      adaId,
      clientA,
      "openid profile email roles groups"
    )

    const expected = {
      sub: adaId,
      name: "Ada Augusta Lovelace",
      given_name: "Ada Augusta",
      family_name: "Lovelace",
      preferred_username: "Ada Augusta Lovelace",
      picture: uploadedAvatarUrl,
      email: `${adaId}@example.test`,
      email_verified: true,
      organization: claimsOrgA,
      roles: ["consoleAdmin"],
      groups: ["platform"],
    }

    expect(idTokenClaims).toMatchObject(expected)
    expect(userinfo).toEqual(expected)
    expect(idTokenClaims.locale).toBeUndefined()
    expect(idTokenClaims.updated_at).toBeUndefined()
  })

  test("emits a signed fallback avatar URL when the account has no uploaded picture", async () => {
    const { idTokenClaims, userinfo } = await issueTokens(
      brunoId,
      clientB,
      "openid profile email"
    )

    const picture = idTokenClaims.picture
    expect(typeof picture).toBe("string")
    expect(picture).toBe(userinfo.picture)
    expect(String(picture)).toMatch(
      /^http:\/\/localhost:3000\/api\/avatar\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.svg$/
    )
    expect(String(picture)).not.toContain(brunoId)
    expect(idTokenClaims.locale).toBeUndefined()
    expect(idTokenClaims.email_verified).toBe(false)
    expect(idTokenClaims.roles).toBeUndefined()
    expect(idTokenClaims.groups).toBeUndefined()

    const token = String(picture).split("/api/avatar/")[1] ?? ""
    const svgResponse = await avatarRoute(new Request(String(picture)), {
      params: Promise.resolve({ token }),
    })
    expect(svgResponse.status).toBe(200)
    expect(svgResponse.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8"
    )
    expect(svgResponse.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    )
    expect(svgResponse.headers.get("cross-origin-resource-policy")).toBe(
      "cross-origin"
    )
    expect(svgResponse.headers.get("access-control-allow-origin")).toBe("*")
    const svg = await svgResponse.text()
    expect(svg).toContain(">BM</text>")
  })

  test("refuses tampered avatar tokens and escapes XML characters in initials", async () => {
    const valid = createAvatarToken({ id: "user-1", name: "<A & B>" })
    const okResponse = await avatarRoute(
      new Request(`http://localhost:3000/api/avatar/${valid}.svg`),
      { params: Promise.resolve({ token: `${valid}.svg` }) }
    )
    expect(okResponse.status).toBe(200)
    const svg = await okResponse.text()
    expect(svg).toContain("&lt;&amp;")
    expect(svg).not.toContain("<&")

    const [payload, signature] = valid.split(".")
    const tampered = `${payload}.${signature?.slice(0, -1)}${signature?.endsWith("a") ? "b" : "a"}.svg`
    const refused = await avatarRoute(
      new Request(`http://localhost:3000/api/avatar/${tampered}`),
      { params: Promise.resolve({ token: tampered }) }
    )
    expect(refused.status).toBe(404)
  })

  test("omits profile and email claims when their scopes are absent, and honours claims.userinfo", async () => {
    const minimal = await issueTokens(adaId, clientA, "openid")
    expect(minimal.idTokenClaims.picture).toBeUndefined()
    expect(minimal.idTokenClaims.email).toBeUndefined()
    expect(minimal.idTokenClaims.name).toBeUndefined()
    expect(minimal.userinfo.picture).toBeUndefined()
    expect(minimal.userinfo.email).toBeUndefined()

    const selective = await issueTokens(adaId, clientA, "openid", {
      claims: JSON.stringify({
        userinfo: { picture: null, roles: null },
      }),
    })
    expect(selective.userinfo).toEqual({
      sub: adaId,
      organization: claimsOrgA,
      picture: uploadedAvatarUrl,
      roles: ["consoleAdmin"],
    })
  })

  test("denies cross-tenant token issuance between the two organizations", async () => {
    await actAs({ id: adaId })
    const url = new URL(`${BASE}/oauth2/authorize`)
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: clientB,
      redirect_uri: REDIRECT_URI,
      scope: "openid profile",
      state: "cross-tenant",
      code_challenge: challenge,
      code_challenge_method: "S256",
    })) {
      url.searchParams.set(key, value)
    }

    const response = await auth.handler(
      new Request(url, { headers: await headers() })
    )
    const location = response.headers.get("location") ?? ""
    expect(location).toBe(`/org/${claimsOrgB}/forbidden`)
  })
})
