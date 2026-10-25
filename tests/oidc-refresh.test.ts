import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"

import { POST as tokenRoute } from "@/app/api/auth/oauth2/token/route"
import { revokeSession } from "@/features/account/actions/revoke-session"
import { createApplication } from "@/features/applications/actions/create-application"
import { updateApplication } from "@/features/applications/actions/update-application"
import { auth } from "@/features/auth/lib/auth"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  applicationRoleMember,
  member,
  oauthClient,
  oauthRefreshToken,
  session,
} from "@/features/shared/lib/db/schema"
import {
  createFixture,
  type Fixture,
  type FixtureUser,
} from "@/tests/support/fixtures"
import { actAs, forgetSessions } from "@/tests/support/request"

// A refresh is the only moment an application hears from Bedrock again after
// sign-in, so it has to carry the same verdict as the first token: the roles the
// member holds now, a refusal once they have left, and nothing once the Bedrock
// session it came from has ended. Driven through the real provider endpoints.

const BASE = "http://localhost:3000/api/auth"
const REDIRECT_URI = "https://app.example.test/callback"
const VERIFIER = "refresh-test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz"

let fixture: Fixture
let dave: FixtureUser
let erin: FixtureUser
let challenge: string
// Owned by organization A, and one owned by B for the cross-tenant case.
let clientA: string
let clientB: string
let roleId: string

async function makeClient(clientId: string, organizationId: string) {
  const now = new Date()
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
    referenceId: organizationId,
    metadata: { clientId, organizationId },
    createdAt: now,
    updatedAt: now,
  })
}

async function addMember(organizationId: string, userId: string) {
  const id = crypto.randomUUID()
  await db.insert(member).values({
    id,
    organizationId,
    userId,
    role: "member",
    createdAt: new Date(),
  })
  return id
}

beforeAll(async () => {
  fixture = await createFixture("refresh")
  dave = await fixture.createUser("dave")
  erin = await fixture.createUser("erin")
  clientA = `refresh-a-${fixture.suffix}`
  clientB = `refresh-b-${fixture.suffix}`
  await makeClient(clientA, fixture.orgA.id)
  await makeClient(clientB, fixture.orgB.id)

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(VERIFIER)
  )
  challenge = Buffer.from(digest).toString("base64url")

  roleId = crypto.randomUUID()
  await db.insert(applicationRole).values({
    id: roleId,
    organizationId: fixture.orgA.id,
    key: "viewer",
    name: "Viewer",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await db
    .insert(applicationRoleClient)
    .values({ roleId, clientId: clientA, createdAt: new Date() })
})

afterAll(async () => {
  await fixture.cleanup()
})

// A code for the current caller, as the provider redirects with it.
async function authorize(
  clientId: string,
  scope = "openid roles offline_access"
) {
  const url = new URL(`${BASE}/oauth2/authorize`)
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope,
    state: "refresh-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  })) {
    url.searchParams.set(key, value)
  }

  const response = await auth.handler(
    new Request(url, { headers: await headers() })
  )
  const location = new URL(response.headers.get("location") ?? "", BASE)
  const code = location.searchParams.get("code")
  if (!code) throw new Error(`No code: ${location.toString()}`)

  return code
}

// A relying party's back-channel call: no cookies, only the form.
async function token(fields: Record<string, string>) {
  const response = await tokenRoute(
    new Request(`${BASE}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    })
  )
  const body = (await response.json()) as Record<string, unknown>

  return { status: response.status, body }
}

async function exchange(clientId: string, code: string) {
  return token({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: VERIFIER,
  })
}

async function refresh(clientId: string, refreshToken: string) {
  return token({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  })
}

function claimsOf(idToken: unknown) {
  if (typeof idToken !== "string") throw new Error("No ID token")
  const payload = idToken.split(".")[1] ?? ""
  return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
    string,
    unknown
  >
}

// Signs the person in to application A and returns the refresh token.
async function signInWithRefresh(person: FixtureUser) {
  await actAs(person)
  const { status, body } = await exchange(clientA, await authorize(clientA))
  expect(status).toBe(200)
  expect(typeof body.refresh_token).toBe("string")

  return body.refresh_token as string
}

// The one session `actAs` opened for this person.
async function currentSessionOf(userId: string) {
  const [row] = await db
    .select({ id: session.id, token: session.token })
    .from(session)
    .where(eq(session.userId, userId))
  if (!row) throw new Error("No session")
  return row
}

describe("issuing a refresh token", () => {
  test("only when offline_access is asked for", async () => {
    await addMember(fixture.orgA.id, dave.id)
    await actAs(dave)

    const without = await exchange(
      clientA,
      await authorize(clientA, "openid roles")
    )
    expect(without.status).toBe(200)
    expect(without.body.refresh_token).toBeUndefined()

    const withOffline = await exchange(clientA, await authorize(clientA))
    expect(withOffline.status).toBe(200)
    expect(typeof withOffline.body.refresh_token).toBe("string")
  })
})

describe("what a refresh says", () => {
  test("the roles held now, not those held at sign-in", async () => {
    const [davesMembership] = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, fixture.orgA.id),
          eq(member.userId, dave.id)
        )
      )
    if (!davesMembership) throw new Error("Dave is not a member of A")
    await db.insert(applicationRoleMember).values({
      roleId,
      memberId: davesMembership.id,
      createdAt: new Date(),
    })

    const refreshToken = await signInWithRefresh(dave)
    const granted = await refresh(clientA, refreshToken)
    expect(granted.status).toBe(200)
    expect(claimsOf(granted.body.id_token)["urn:bedrock:roles"]).toEqual([
      "viewer",
    ])

    await db
      .delete(applicationRoleMember)
      .where(eq(applicationRoleMember.memberId, davesMembership.id))

    const revoked = await refresh(clientA, granted.body.refresh_token as string)
    expect(revoked.status).toBe(200)
    expect(claimsOf(revoked.body.id_token)["urn:bedrock:roles"]).toEqual([])
  })

  test("a refusal, as invalid_grant, once the member has left", async () => {
    const membershipId = await addMember(fixture.orgA.id, erin.id)
    const refreshToken = await signInWithRefresh(erin)

    await db.delete(member).where(eq(member.id, membershipId))

    const refused = await refresh(clientA, refreshToken)
    expect(refused.status).toBe(400)
    expect(refused.body.error).toBe("invalid_grant")
  })
})

describe("whose refresh token it is", () => {
  test("another organization's application cannot use it", async () => {
    await actAs(fixture.bob)
    // Bob signs in to B's application, which he may.
    const own = await exchange(clientB, await authorize(clientB))
    expect(own.status).toBe(200)
    const bobsToken = own.body.refresh_token as string
    expect(typeof bobsToken).toBe("string")

    // A's application presenting B's refresh token is refused, and so is B's
    // application presenting one issued to A.
    expect((await refresh(clientA, bobsToken)).body.error).toBe("invalid_grant")

    const alicesToken = await signInWithRefresh(fixture.alice)
    expect((await refresh(clientB, alicesToken)).body.error).toBe(
      "invalid_grant"
    )
  })
})

describe("ending the Bedrock session", () => {
  test("signing out takes the refresh token with it", async () => {
    const refreshToken = await signInWithRefresh(fixture.carol)
    const ended = await currentSessionOf(fixture.carol.id)

    const context = await auth.$context
    await context.internalAdapter.deleteSession(ended.token)
    forgetSessions([fixture.carol.id])

    expect((await refresh(clientA, refreshToken)).body.error).toBe(
      "invalid_grant"
    )
  })

  test("so does revoking that session from another one", async () => {
    const refreshToken = await signInWithRefresh(dave)
    const ended = await currentSessionOf(dave.id)

    // A second session of Dave's ends the first, as the account page does.
    forgetSessions([dave.id])
    await actAs(dave)
    expect(await revokeSession(ended.id)).toEqual({ success: true })

    expect(
      await db
        .select()
        .from(oauthRefreshToken)
        .where(eq(oauthRefreshToken.sessionId, ended.id))
    ).toEqual([])
    expect((await refresh(clientA, refreshToken)).body.error).toBe(
      "invalid_grant"
    )
  })
})

describe("a refused token request", () => {
  test("is logged with the client and error, never the token", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const secretLooking = "not-a-real-refresh-token-value"
      const refused = await refresh(clientA, secretLooking)
      expect(refused.status).toBe(400)

      const line = warn.mock.calls
        .map((call) => call.map(String).join(" "))
        .find((entry) => entry.includes("token request refused"))
      expect(line).toBeDefined()
      expect(line).toContain(`"client_id":"${clientA}"`)
      expect(line).toContain('"grant_type":"refresh_token"')
      expect(line).toContain('"error":"invalid_grant"')
      expect(line).not.toContain(secretLooking)
    } finally {
      warn.mockRestore()
    }
  })
})

describe("signing out from an application", () => {
  test("its post-logout URI is registered, and clearing it sticks", async () => {
    await actAs(fixture.alice)
    const created = await createApplication({
      organizationId: fixture.orgA.id,
      name: "Logout app",
      redirectUris: [REDIRECT_URI],
      postLogoutRedirectUris: ["https://app.example.test/signed-out"],
    })
    if (!created.success) throw new Error(created.error)

    const [row] = await db
      .select({
        enableEndSession: oauthClient.enableEndSession,
        postLogoutRedirectUris: oauthClient.postLogoutRedirectUris,
      })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, created.clientId))
    expect(row).toEqual({
      enableEndSession: true,
      postLogoutRedirectUris: ["https://app.example.test/signed-out"],
    })

    expect(
      await updateApplication({
        organizationId: fixture.orgA.id,
        clientId: created.clientId,
        name: "Logout app",
        redirectUris: [REDIRECT_URI],
        postLogoutRedirectUris: [],
      })
    ).toEqual({ success: true })

    const [cleared] = await db
      .select({ uris: oauthClient.postLogoutRedirectUris })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, created.clientId))
    expect(cleared?.uris).toBeNull()
  })

  test("another organization cannot register one on it", async () => {
    await actAs(fixture.bob)
    const result = await updateApplication({
      organizationId: fixture.orgA.id,
      clientId: clientA,
      name: "Taken over",
      redirectUris: [REDIRECT_URI],
      postLogoutRedirectUris: ["https://evil.example.test/"],
    })
    expect(result.success).toBe(false)

    const [row] = await db
      .select({ uris: oauthClient.postLogoutRedirectUris })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientA))
    expect(row?.uris).toBeNull()
  })

  test("ends the Bedrock session and returns to the application", async () => {
    await db
      .update(oauthClient)
      .set({
        enableEndSession: true,
        postLogoutRedirectUris: ["https://app.example.test/signed-out"],
      })
      .where(eq(oauthClient.clientId, clientA))

    await actAs(fixture.alice)
    const signedIn = await exchange(clientA, await authorize(clientA, "openid"))
    expect(signedIn.status).toBe(200)

    const url = new URL(`${BASE}/oauth2/end-session`)
    url.searchParams.set("id_token_hint", signedIn.body.id_token as string)
    url.searchParams.set(
      "post_logout_redirect_uri",
      "https://app.example.test/signed-out"
    )
    url.searchParams.set("state", "bye")

    // The provider checks the hint against its own published keys over HTTP.
    // There is no server here, so that one request is answered in-process.
    const realFetch = globalThis.fetch
    const fetchKeys = spyOn(globalThis, "fetch").mockImplementation((async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const target = new Request(input, init)
      return target.url === `${BASE}/jwks`
        ? auth.handler(target)
        : realFetch(input, init)
    }) as typeof fetch)
    const response = await auth
      .handler(new Request(url, { headers: await headers() }))
      .finally(() => fetchKeys.mockRestore())

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/signed-out?state=bye"
    )
    expect(
      await db
        .select()
        .from(session)
        .where(eq(session.userId, fixture.alice.id))
    ).toEqual([])
    forgetSessions([fixture.alice.id])
  })
})
