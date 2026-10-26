import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { eq, inArray } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import {
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
  session,
  verification,
} from "@/features/shared/lib/db/schema"
import { HOUSEKEEPING_TASKS } from "@/features/shared/lib/housekeeping-tasks"
import { housekeepSessionsAndTokens } from "@/scripts/housekeeping/sessions-and-tokens"
import { TASKS } from "@/scripts/housekeeping/tasks"
import {
  createFixture,
  type Fixture,
  type FixtureUser,
} from "@/tests/support/fixtures"

// Better Auth only deletes an expired session or token when someone presents
// it. Housekeeping sweeps the rest, and the tokens of a session it sweeps go
// with it, as they would through Better Auth's own session hook.

const HOUR = 60 * 60 * 1000

let fixture: Fixture
let alice: FixtureUser
let bob: FixtureUser
let clientId: string

const ago = (ms: number) => new Date(Date.now() - ms)
const ahead = (ms: number) => new Date(Date.now() + ms)

async function insertSession(userId: string, expiresAt: Date) {
  const id = crypto.randomUUID()
  await db.insert(session).values({
    id,
    token: crypto.randomUUID(),
    userId,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

async function insertRefreshToken(
  userId: string,
  sessionId: string | null,
  expiresAt: Date | null,
  revoked: Date | null = null
) {
  const id = crypto.randomUUID()
  await db.insert(oauthRefreshToken).values({
    id,
    token: crypto.randomUUID(),
    clientId,
    userId,
    sessionId,
    expiresAt,
    revoked,
    createdAt: new Date(),
    scopes: ["openid", "offline_access"],
  })
  return id
}

async function insertAccessToken(
  userId: string,
  sessionId: string | null,
  expiresAt: Date | null,
  refreshId: string | null = null
) {
  const id = crypto.randomUUID()
  await db.insert(oauthAccessToken).values({
    id,
    token: crypto.randomUUID(),
    clientId,
    userId,
    sessionId,
    refreshId,
    expiresAt,
    createdAt: new Date(),
    scopes: ["openid"],
  })
  return id
}

async function remaining(
  table: typeof session | typeof oauthRefreshToken | typeof oauthAccessToken,
  ids: string[]
) {
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(inArray(table.id, ids))
  return rows.map((row) => row.id).toSorted()
}

beforeAll(async () => {
  fixture = await createFixture("sweep")
  alice = fixture.alice
  bob = fixture.bob
  clientId = `test-sweep-${fixture.suffix}`

  const now = new Date()
  await db.insert(oauthClient).values({
    id: clientId,
    clientId,
    name: clientId,
    redirectUris: ["https://app.example.test/callback"],
    applicationType: "web",
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    skipConsent: true,
    requirePKCE: true,
    referenceId: fixture.orgA.id,
    metadata: { clientId, organizationId: fixture.orgA.id },
    createdAt: now,
    updatedAt: now,
  })
})

afterAll(async () => {
  await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId))
  await fixture.cleanup()
})

describe("the sessions and tokens task", () => {
  test("is scheduled under a lock key of its own", () => {
    expect(HOUSEKEEPING_TASKS).toContain("sessionsAndTokens")
    const task = TASKS.find((entry) => entry.name === "sessionsAndTokens")
    expect(task?.lockKey).toBe(6)
    expect(new Set(TASKS.map((entry) => entry.lockKey)).size).toBe(TASKS.length)
  })

  test("an expired session goes, and every token issued from it with it", async () => {
    const expired = await insertSession(alice.id, ago(HOUR))
    // Still within their own lifetime: the session is what ends them.
    const refresh = await insertRefreshToken(alice.id, expired, ahead(HOUR))
    const access = await insertAccessToken(
      alice.id,
      expired,
      ahead(HOUR),
      refresh
    )

    const result = await housekeepSessionsAndTokens()

    expect(await remaining(session, [expired])).toBeEmpty()
    expect(await remaining(oauthRefreshToken, [refresh])).toBeEmpty()
    expect(await remaining(oauthAccessToken, [access])).toBeEmpty()
    expect(result.sessions).toBeGreaterThanOrEqual(1)
    expect(result.refreshTokens).toBeGreaterThanOrEqual(1)
    expect(result.accessTokens).toBeGreaterThanOrEqual(1)
  })

  test("a live session keeps its live tokens and loses its expired ones", async () => {
    const live = await insertSession(alice.id, ahead(24 * HOUR))
    const liveRefresh = await insertRefreshToken(alice.id, live, ahead(HOUR))
    const liveAccess = await insertAccessToken(
      alice.id,
      live,
      ahead(HOUR),
      liveRefresh
    )
    const expiredRefresh = await insertRefreshToken(alice.id, live, ago(1000))
    const expiredAccess = await insertAccessToken(alice.id, live, ago(1000))
    const undatedAccess = await insertAccessToken(alice.id, live, null)

    await housekeepSessionsAndTokens()

    expect(await remaining(session, [live])).toEqual([live])
    expect(
      await remaining(oauthRefreshToken, [liveRefresh, expiredRefresh])
    ).toEqual([liveRefresh])
    expect(
      await remaining(oauthAccessToken, [
        liveAccess,
        expiredAccess,
        undatedAccess,
      ])
    ).toEqual([liveAccess])
  })

  test("a rotated refresh token stays until it expires, for reuse detection", async () => {
    const live = await insertSession(alice.id, ahead(24 * HOUR))
    const rotated = await insertRefreshToken(
      alice.id,
      live,
      ahead(HOUR),
      ago(HOUR)
    )
    const spent = await insertRefreshToken(
      alice.id,
      live,
      ago(1000),
      ago(2 * HOUR)
    )

    await housekeepSessionsAndTokens()

    expect(await remaining(oauthRefreshToken, [rotated, spent])).toEqual([
      rotated,
    ])
  })

  test("another person's live session and tokens are untouched", async () => {
    const aliceExpired = await insertSession(alice.id, ago(HOUR))
    const bobLive = await insertSession(bob.id, ahead(24 * HOUR))
    const bobRefresh = await insertRefreshToken(bob.id, bobLive, ahead(HOUR))
    const bobAccess = await insertAccessToken(
      bob.id,
      bobLive,
      ahead(HOUR),
      bobRefresh
    )

    await housekeepSessionsAndTokens()

    expect(await remaining(session, [aliceExpired, bobLive])).toEqual([bobLive])
    expect(await remaining(oauthRefreshToken, [bobRefresh])).toEqual([
      bobRefresh,
    ])
    expect(await remaining(oauthAccessToken, [bobAccess])).toEqual([bobAccess])
  })

  test("expired verification values go and live ones stay", async () => {
    const identifier = `test-sweep-${fixture.suffix}`
    const now = new Date()
    const [expired, live] = [crypto.randomUUID(), crypto.randomUUID()]
    await db.insert(verification).values([
      {
        id: expired,
        identifier,
        value: "spent",
        expiresAt: ago(1000),
        createdAt: now,
        updatedAt: now,
      },
      {
        id: live,
        identifier,
        value: "pending",
        expiresAt: ahead(HOUR),
        createdAt: now,
        updatedAt: now,
      },
    ])

    try {
      const result = await housekeepSessionsAndTokens()

      const rows = await db
        .select({ id: verification.id })
        .from(verification)
        .where(eq(verification.identifier, identifier))
      expect(rows.map((row) => row.id)).toEqual([live])
      expect(result.verifications).toBeGreaterThanOrEqual(1)
    } finally {
      await db
        .delete(verification)
        .where(eq(verification.identifier, identifier))
    }
  })
})
