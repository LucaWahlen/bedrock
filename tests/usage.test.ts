import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq, gte, isNull, lt, sql } from "drizzle-orm"

import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  oauthAccessToken,
  oauthClient,
  usageDaily,
} from "@/features/shared/lib/db/schema"
import { getInstanceUsage } from "@/features/usage/actions/get-instance-usage"
import { getInstanceUsageReport } from "@/features/usage/actions/get-instance-usage-report"
import { getOrganizationUsage } from "@/features/usage/actions/get-organization-usage"
import { getOrganizationUsageReport } from "@/features/usage/actions/get-organization-usage-report"
import { utcDay } from "@/features/usage/utils/days"
import { housekeepUsage } from "@/scripts/housekeeping/usage"
import { createFixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

// The rollup runs against a clock set in 2001, where only this file's rows
// exist, so counts are exact without touching the instance's real days. Rows
// it writes for that year are removed afterwards; tenant rows also cascade
// with the fixture's organizations.

const fixture = await createFixture("usage")
const { root, rootOwner, orgA, orgB, alice, bob, carol, suffix } = fixture

const NOW = new Date("2001-03-01T12:00:00Z")
const YESTERDAY = "2001-02-28"
const ON_YESTERDAY = new Date("2001-02-28T09:30:00Z")
const PAST = sql`${usageDaily.day} < '2002-01-01'`

const clients = { a: `test-usage-${suffix}-a`, b: `test-usage-${suffix}-b` }

let eventCount = 0
function signIn(
  organization: { id: string; name: string },
  actor: { id: string } | null,
  outcome: "success" | "failure" | "denied",
  createdAt: Date,
  detail: { metadata?: Record<string, unknown>; reason?: string } = {}
): typeof auditEvent.$inferInsert {
  eventCount += 1
  return {
    id: `test-usage-${suffix}-event-${eventCount}`,
    action: "authentication.login",
    outcome,
    actorType: actor ? "user" : "anonymous",
    actorUserId: actor?.id ?? null,
    organizationId: organization.id,
    organizationName: organization.name,
    createdAt,
    ...detail,
  }
}

// Any other audited event, by the given actor and at the given organization.
function event(
  action: string,
  organization: { id: string } | null,
  actor: { id: string },
  createdAt: Date,
  detail: Partial<typeof auditEvent.$inferInsert> = {}
): typeof auditEvent.$inferInsert {
  eventCount += 1
  return {
    id: `test-usage-${suffix}-event-${eventCount}`,
    action,
    actorUserId: actor.id,
    organizationId: organization?.id ?? null,
    createdAt,
    ...detail,
  }
}

const invitations = {
  accepted: `test-usage-${suffix}-invitation-accepted`,
  revoked: `test-usage-${suffix}-invitation-revoked`,
  expired: `test-usage-${suffix}-invitation-expired`,
  open: `test-usage-${suffix}-invitation-open`,
  elsewhere: `test-usage-${suffix}-invitation-elsewhere`,
}

let tokenCount = 0
function token(
  clientId: string,
  userId: string,
  createdAt: Date
): typeof oauthAccessToken.$inferInsert {
  tokenCount += 1
  return {
    id: `test-usage-${suffix}-token-${tokenCount}`,
    token: `test-usage-${suffix}-token-${tokenCount}`,
    clientId,
    userId,
    scopes: ["openid"],
    createdAt,
  }
}

async function dayRows(day: string) {
  return db
    .select({
      organizationId: usageDaily.organizationId,
      metric: usageDaily.metric,
      subjectId: usageDaily.subjectId,
      value: usageDaily.value,
    })
    .from(usageDaily)
    .where(eq(usageDaily.day, day))
}

function sorted(rows: Awaited<ReturnType<typeof dayRows>>) {
  return rows.map((row) => JSON.stringify(row)).toSorted()
}

function valueOf(
  rows: Awaited<ReturnType<typeof dayRows>>,
  organizationId: string | null,
  metric: string,
  subjectId: string | null = null
) {
  return rows.find(
    (row) =>
      row.organizationId === organizationId &&
      row.metric === metric &&
      row.subjectId === subjectId
  )?.value
}

beforeAll(async () => {
  const now = new Date()
  await db.insert(oauthClient).values(
    [
      [clients.a, orgA.id],
      [clients.b, orgB.id],
    ].map(([clientId, organizationId]) => ({
      id: clientId,
      clientId,
      name: `Application ${clientId}`,
      redirectUris: ["https://app.example.test/callback"],
      referenceId: organizationId,
      createdAt: now,
      updatedAt: now,
    }))
  )

  const invited = (id: string, organization = orgA) =>
    event("organization.member_invited", organization, alice, now, {
      targetType: "invitation",
      targetId: id,
    })
  await db.insert(auditEvent).values([
    signIn(orgA, alice, "success", ON_YESTERDAY),
    signIn(orgA, alice, "success", ON_YESTERDAY, {
      metadata: { secondFactor: "totp" },
    }),
    signIn(orgA, carol, "success", ON_YESTERDAY, {
      metadata: { method: "passkey" },
    }),
    signIn(orgA, null, "failure", ON_YESTERDAY, {
      reason: "Invalid email or password",
    }),
    signIn(orgB, bob, "success", ON_YESTERDAY),
    signIn(orgB, bob, "denied", ON_YESTERDAY, {
      reason: "Too many sign-in attempts",
    }),
    event("organization.member_added", orgA, alice, ON_YESTERDAY),
    event("organization.invitation_accepted", orgA, carol, ON_YESTERDAY),
    // Refused, so nobody joined.
    event("organization.member_added", orgA, alice, ON_YESTERDAY, {
      outcome: "failure",
    }),
    event("organization.member_removed", orgB, bob, ON_YESTERDAY),
    event("user.created", null, carol, ON_YESTERDAY),
    // Today, for the invitation funnel: four sent by A, one by B.
    invited(invitations.accepted),
    invited(invitations.revoked),
    invited(invitations.expired),
    invited(invitations.open),
    invited(invitations.elsewhere, orgB),
    event("organization.invitation_accepted", orgA, carol, now, {
      metadata: { invitationId: invitations.accepted },
    }),
    event("organization.invitation_revoked", orgA, alice, now, {
      targetType: "invitation",
      targetId: invitations.revoked,
    }),
    // Today, for the live figures: one in A, three in B.
    signIn(orgA, alice, "success", now),
    signIn(orgB, bob, "success", now),
    signIn(orgB, bob, "success", now),
    signIn(orgB, bob, "success", now),
  ])
  await db
    .insert(oauthAccessToken)
    .values([
      token(clients.a, carol.id, ON_YESTERDAY),
      token(clients.b, bob.id, ON_YESTERDAY),
      token(clients.b, bob.id, ON_YESTERDAY),
      token(clients.a, alice.id, now),
      token(clients.b, bob.id, now),
    ])
  await db.insert(invitation).values({
    id: invitations.open,
    organizationId: orgA.id,
    email: `test-usage-${suffix}-open@example.test`,
    role: "member",
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
    inviterId: alice.id,
    tokenHash: `test-usage-${suffix}-open`,
    lastSentAt: now,
  })
})

afterAll(async () => {
  await db.delete(usageDaily).where(PAST)
  await fixture.cleanup()
})

describe("usage rollup", () => {
  test("counts each organization, and the instance as their sum", async () => {
    const result = await housekeepUsage({ now: NOW, retentionDays: 30 })
    // 2001-01-31 to 2001-02-28: the 29 whole days inside retention.
    expect(result.days).toBe(29)
    expect(result.from).toBe("2001-01-31")

    const rows = await dayRows(YESTERDAY)
    expect(valueOf(rows, orgA.id, "sign_ins")).toBe(3)
    expect(valueOf(rows, orgA.id, "sign_in_failures")).toBe(1)
    // Alice and Carol signed in; Carol also received a token.
    expect(valueOf(rows, orgA.id, "active_users")).toBe(2)
    expect(valueOf(rows, orgA.id, "tokens_issued")).toBe(1)
    expect(valueOf(rows, orgA.id, "tokens_issued", clients.a)).toBe(1)

    expect(valueOf(rows, orgB.id, "sign_ins")).toBe(1)
    expect(valueOf(rows, orgB.id, "sign_in_failures")).toBe(1)
    expect(valueOf(rows, orgB.id, "active_users")).toBe(1)
    expect(valueOf(rows, orgB.id, "tokens_issued", clients.b)).toBe(2)
    expect(valueOf(rows, orgA.id, "tokens_issued", clients.b)).toBeUndefined()

    // Only this file's rows exist on that day, so the instance is their sum.
    for (const metric of ["sign_ins", "sign_in_failures", "tokens_issued"]) {
      expect(valueOf(rows, null, metric)).toBe(
        (valueOf(rows, orgA.id, metric) ?? 0) +
          (valueOf(rows, orgB.id, metric) ?? 0)
      )
    }
    expect(valueOf(rows, null, "active_users")).toBe(3)

    // Yesterday's end-of-day snapshot: Alice and Carol, neither with a second
    // factor, which is recorded as no row rather than a zero.
    expect(valueOf(rows, orgA.id, "members")).toBe(2)
    expect(valueOf(rows, orgA.id, "members_with_second_factor")).toBeUndefined()
    expect(valueOf(rows, orgA.id, "applications")).toBe(1)
    expect(valueOf(rows, null, "users")).toBeGreaterThan(0)

    // A day with nothing in it still records the instance at zero.
    const quiet = await dayRows("2001-02-10")
    expect(valueOf(quiet, null, "sign_ins")).toBe(0)
    expect(quiet.filter((row) => row.organizationId !== null)).toEqual([])
  })

  test("breaks sign-ins down and counts engagement and membership", async () => {
    const rows = await dayRows(YESTERDAY)

    expect(valueOf(rows, orgA.id, "sign_in_methods", "password")).toBe(1)
    expect(valueOf(rows, orgA.id, "sign_in_methods", "two_factor")).toBe(1)
    expect(valueOf(rows, orgA.id, "sign_in_methods", "passkey")).toBe(1)
    expect(valueOf(rows, orgB.id, "sign_in_methods", "password")).toBe(1)
    expect(valueOf(rows, orgB.id, "sign_in_methods", "passkey")).toBeUndefined()
    expect(
      valueOf(rows, orgA.id, "sign_in_failure_reasons", "invalid_credentials")
    ).toBe(1)
    expect(
      valueOf(rows, orgB.id, "sign_in_failure_reasons", "rate_limited")
    ).toBe(1)
    expect(valueOf(rows, null, "sign_in_methods", "password")).toBe(2)
    // Every sign-in of the day was at 09:30 UTC.
    expect(valueOf(rows, orgA.id, "sign_ins_by_hour", "9")).toBe(3)
    expect(valueOf(rows, orgB.id, "sign_ins_by_hour", "9")).toBe(1)

    // Alice and Carol in A, Bob in B; the year 2001 holds nobody else.
    expect(valueOf(rows, orgA.id, "weekly_active_users")).toBe(2)
    expect(valueOf(rows, orgA.id, "monthly_active_users")).toBe(2)
    expect(valueOf(rows, orgB.id, "weekly_active_users")).toBe(1)
    expect(valueOf(rows, null, "monthly_active_users")).toBe(3)
    expect(valueOf(rows, orgA.id, "application_active_users", clients.a)).toBe(
      1
    )
    expect(valueOf(rows, orgB.id, "application_active_users", clients.b)).toBe(
      1
    )
    expect(
      valueOf(rows, orgA.id, "application_active_users", clients.b)
    ).toBeUndefined()

    expect(valueOf(rows, orgA.id, "members_joined")).toBe(2)
    expect(valueOf(rows, orgA.id, "members_removed")).toBeUndefined()
    expect(valueOf(rows, orgB.id, "members_removed")).toBe(1)
    expect(valueOf(rows, null, "members_joined")).toBe(2)
    // Accounts are the instance's alone.
    expect(valueOf(rows, null, "users_created")).toBe(1)
    expect(
      rows.some((row) => row.metric === "users_created" && row.organizationId)
    ).toBe(false)

    expect(valueOf(rows, orgA.id, "members_by_role", "owner")).toBe(1)
    expect(valueOf(rows, orgA.id, "members_by_role", "member")).toBe(1)
    expect(valueOf(rows, null, "rollup_version")).toBe(2)
  })

  test("recounts a day rolled up before the detail metrics", async () => {
    await db
      .delete(usageDaily)
      .where(
        and(
          eq(usageDaily.day, "2001-02-10"),
          eq(usageDaily.metric, "rollup_version")
        )
      )

    const result = await housekeepUsage({ now: NOW, retentionDays: 30 })
    expect(result.days).toBe(2)
    expect(result.from).toBe("2001-02-10")
    expect(valueOf(await dayRows("2001-02-10"), null, "rollup_version")).toBe(2)
  })

  test("is idempotent and only recounts yesterday", async () => {
    const before = await dayRows(YESTERDAY)
    const result = await housekeepUsage({ now: NOW, retentionDays: 30 })
    expect(result.days).toBe(1)
    expect(result.from).toBe(YESTERDAY)

    const after = await dayRows(YESTERDAY)
    expect(sorted(after)).toEqual(sorted(before))
  })

  test("backfills a missing day, and only within the window", async () => {
    await db.delete(usageDaily).where(eq(usageDaily.day, "2001-02-10"))

    const result = await housekeepUsage({ now: NOW, retentionDays: 30 })
    expect(result.days).toBe(2)
    expect(result.from).toBe("2001-02-10")
    expect(valueOf(await dayRows("2001-02-10"), null, "sign_ins")).toBe(0)

    const [beforeWindow] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(usageDaily)
      .where(
        and(
          PAST,
          lt(usageDaily.day, "2001-01-31"),
          gte(usageDaily.day, "2000-01-01")
        )
      )
    expect(beforeWindow?.count).toBe(0)
  })

  test("reaches back at most 90 days, however long retention is", async () => {
    const result = await housekeepUsage({ now: NOW, retentionDays: 400 })
    // 2000-12-02 is 89 days before 2001-03-01; up to 2001-01-30 was missing.
    expect(result.from).toBe("2000-12-02")
    expect(result.days).toBe(61)

    const [earliest] = await db
      .select({ day: sql<string>`min(${usageDaily.day})` })
      .from(usageDaily)
      .where(
        and(
          PAST,
          isNull(usageDaily.organizationId),
          eq(usageDaily.metric, "sign_ins")
        )
      )
    expect(earliest?.day).toBe("2000-12-02")
  })
})

describe("tenant usage", () => {
  test("an owner reads their own organization, today included", async () => {
    await actAs(alice)
    const usage = await getOrganizationUsage({
      organizationId: orgA.id,
      period: 7,
    })

    // Today's sign-in in A, not B's three.
    expect(usage.signIns.current).toBe(1)
    expect(usage.series.at(-1)).toEqual({
      day: utcDay(new Date()),
      signIns: 1,
      activeUsers: 1,
    })
    expect(usage.applications).toEqual([
      { clientId: clients.a, name: `Application ${clients.a}`, tokens: 1 },
    ])
    expect(usage.secondFactor).toMatchObject({
      members: 2,
      withSecondFactor: 0,
    })
  })

  test("another tenant's owner is refused", async () => {
    await actAs(bob)
    await expect(
      getOrganizationUsage({ organizationId: orgA.id, period: 30 })
    ).rejects.toBeInstanceOf(ForbiddenError)

    const own = await getOrganizationUsage({
      organizationId: orgB.id,
      period: 30,
    })
    expect(own.signIns.current).toBe(3)
    expect(own.applications.map((row) => row.clientId)).toEqual([clients.b])
  })

  test("a plain member is refused", async () => {
    await actAs(carol)
    await expect(
      getOrganizationUsage({ organizationId: orgA.id, period: 30 })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  test("root administration grants nothing in a tenant", async () => {
    await actAs(rootOwner)
    await expect(
      getOrganizationUsage({ organizationId: orgA.id, period: 30 })
    ).rejects.toBeInstanceOf(ForbiddenError)
    // Root has no tenant usage of its own; the instance's is another read.
    await expect(
      getOrganizationUsage({ organizationId: root.id, period: 30 })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  test("a period outside the offered ones is rejected", async () => {
    await actAs(alice)
    await expect(
      getOrganizationUsage({
        organizationId: orgA.id,
        period: 14 as unknown as 30,
      })
    ).rejects.toThrow()
  })
})

describe("instance usage", () => {
  test("a tenant owner is refused, and a visitor is not signed in", async () => {
    await actAs(alice)
    await expect(getInstanceUsage({ period: 30 })).rejects.toBeInstanceOf(
      ForbiddenError
    )

    await actAs(null)
    await expect(getInstanceUsage({ period: 30 })).rejects.toBeInstanceOf(
      UnauthorizedError
    )
  })

  test("a root administrator reads the instance", async () => {
    await actAs(rootOwner)
    const usage = await getInstanceUsage({ period: 7 })

    // At least this file's four sign-ins today, whatever else happened.
    expect(usage.signIns.current).toBeGreaterThanOrEqual(4)
    expect(usage.series).toHaveLength(7)
    expect(usage.users.current).toBeGreaterThan(0)
    expect(
      usage.topOrganizations.some((organization) => organization.id === root.id)
    ).toBe(false)
  })
})

describe("usage reports", () => {
  test("an owner reads their own organization in depth, and nothing of another", async () => {
    await actAs(alice)
    const report = await getOrganizationUsageReport({
      organizationId: orgA.id,
      period: 7,
    })

    // Today's one sign-in in A, by password; B's three are not here.
    expect(report.signIns.current).toBe(1)
    expect(report.authentication.methods).toEqual([
      { key: "password", value: 1 },
    ])
    expect(report.applications.map((row) => row.clientId)).toEqual([clients.a])
    expect(report.members).toBe(2)
    expect(report.roles).toEqual([
      { key: "member", value: 1 },
      { key: "owner", value: 1 },
    ])
    // B's invitation is not A's.
    expect(report.invitations).toMatchObject({
      sent: 4,
      accepted: 1,
      revoked: 1,
      open: 1,
      expired: 1,
    })
    expect(report.heatmap).toHaveLength(7)
    expect(report.heatmap.flat().reduce((sum, count) => sum + count, 0)).toBe(1)
  })

  test("another tenant's owner, a member and root are refused", async () => {
    for (const user of [bob, carol, rootOwner]) {
      await actAs(user)
      await expect(
        getOrganizationUsageReport({ organizationId: orgA.id, period: 30 })
      ).rejects.toBeInstanceOf(ForbiddenError)
    }

    await actAs(bob)
    const own = await getOrganizationUsageReport({
      organizationId: orgB.id,
      period: 30,
    })
    expect(own.applications.map((row) => row.clientId)).toEqual([clients.b])
    expect(own.invitations.sent).toBe(1)
  })

  test("only a root administrator reads the instance", async () => {
    await actAs(alice)
    await expect(getInstanceUsageReport({ period: 30 })).rejects.toBeInstanceOf(
      ForbiddenError
    )

    await actAs(rootOwner)
    const report = await getInstanceUsageReport({ period: 365 })
    expect(report.activity).toHaveLength(365)
    expect(report.signIns.current).toBeGreaterThanOrEqual(4)
    const ranked = report.topOrganizations.map((row) => row.id)
    expect(ranked).not.toContain(root.id)
    expect(ranked).toContain(orgB.id)
  })
})
