import { afterAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { login } from "@/features/auth/actions/login"
import { decideSignIn } from "@/features/auth/utils/sign-in-gate"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  organization,
  session,
} from "@/features/shared/lib/db/schema"
import { givePassword } from "@/tests/support/credentials"
import { createFixture } from "@/tests/support/fixtures"
import { browse } from "@/tests/support/request"

// The gate every sign-in finishes through, whichever factor proved it. Password
// sign-ins are driven here; the two-factor and passkey suites drive the same
// gate from their own ends.

describe("deciding a sign-in", () => {
  const active = { status: "active" } as const
  const suspended = { status: "suspended" } as const

  test("lets a member of an active organization in", () => {
    expect(decideSignIn({ isMember: true, isInvited: false }, active)).toEqual({
      allowed: true,
      next: "organization",
      pendingInvitation: false,
    })
  })

  test("sends an invited non-member to their invitation", () => {
    expect(
      decideSignIn({ isMember: false, isInvited: true }, suspended)
    ).toEqual({ allowed: true, next: "invitation", pendingInvitation: true })
  })

  test("refuses a stranger", () => {
    expect(decideSignIn({ isMember: false, isInvited: false }, active)).toEqual(
      {
        allowed: false,
        reason: "You are not a member of this organization",
        refusal: "notMember",
      }
    )
  })

  test("refuses a member of a suspended organization", () => {
    expect(
      decideSignIn({ isMember: true, isInvited: false }, suspended)
    ).toEqual({
      allowed: false,
      reason: "This organization is suspended",
      refusal: "organizationSuspended",
    })
  })
})

const PASSWORD = "correct horse battery staple"
const fixture = await createFixture("sign-in-gate")
const { orgA, orgB, alice, bob } = fixture
await givePassword(alice.id, PASSWORD)
await givePassword(bob.id, PASSWORD)

afterAll(() => fixture.cleanup())

async function sessionsOf(userId: string) {
  return db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.userId, userId))
}

describe("signing in with a password", () => {
  test("a member is let in", async () => {
    browse()
    expect(
      await login({ email: alice.email, password: PASSWORD }, orgA.slug)
    ).toEqual({ success: true, next: "organization" })
    expect((await getAccessContext()).user?.id).toBe(alice.id)
  })

  test("a non-member is refused and their new session revoked", async () => {
    await db.delete(session).where(eq(session.userId, alice.id))
    browse()

    expect(
      await login({ email: alice.email, password: PASSWORD }, orgB.slug)
    ).toEqual({
      success: false,
      error: "You are not a member of this organization",
    })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    expect(await sessionsOf(alice.id)).toEqual([])

    const [event] = await db
      .select({ outcome: auditEvent.outcome, metadata: auditEvent.metadata })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "authentication.login"),
          eq(auditEvent.actorUserId, alice.id),
          eq(auditEvent.organizationId, orgB.id)
        )
      )
    expect(event).toEqual({ outcome: "denied", metadata: null })
  })

  test("an invited non-member is sent to the invitation", async () => {
    await db.insert(invitation).values({
      id: crypto.randomUUID(),
      organizationId: orgB.id,
      email: alice.email,
      role: "member",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastSentAt: new Date(),
      inviterId: bob.id,
      tokenHash: crypto.randomUUID(),
    })
    browse()

    expect(
      await login({ email: alice.email, password: PASSWORD }, orgB.slug)
    ).toEqual({ success: true, next: "invitation" })
  })

  test("a member of a suspended organization is refused", async () => {
    await db
      .update(organization)
      .set({ status: "suspended", statusChangedAt: new Date() })
      .where(eq(organization.id, orgB.id))

    try {
      browse()
      expect(
        await login({ email: bob.email, password: PASSWORD }, orgB.slug)
      ).toEqual({ success: false, error: "This organization is suspended" })
      expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    } finally {
      await db
        .update(organization)
        .set({ status: "active" })
        .where(eq(organization.id, orgB.id))
    }
  })

  test("a wrong password says nothing about the account", async () => {
    browse()
    expect(
      await login({ email: bob.email, password: "not it" }, orgB.slug)
    ).toEqual({ success: false, error: "Invalid email or password" })
  })
})
