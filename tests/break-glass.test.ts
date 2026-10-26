import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { getAccessContext, membershipIn } from "@/features/auth"
import { endBreakGlass } from "@/features/organizations/actions/end-break-glass"
import { setMemberRole } from "@/features/organizations/actions/set-member-role"
import { startBreakGlass } from "@/features/organizations/actions/start-break-glass"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  breakGlassGrant,
  member,
  oauthClient,
  organization,
  user,
} from "@/features/shared/lib/db/schema"
import { resolveApplicationAccess } from "@/features/shared/lib/oidc-claims"
import {
  createFixture,
  type Fixture,
  type FixtureUser,
} from "@/tests/support/fixtures"
import { outbox } from "@/tests/support/mail"
import { actAs, discardDeferred, runDeferred } from "@/tests/support/request"

// Break-glass lets root act as a tenant's owner, which is everything the rest
// of the system otherwise refuses root. So these prove the fences: who may
// open it, that it is bounded and visible, and that it never becomes a
// membership an application could see.

const REASON = "Every owner left; restoring an owner on request"

let fixture: Fixture
let rootAdmin: FixtureUser
let clientA: string

async function giveSecondFactor(userId: string, enabled = true) {
  await db
    .update(user)
    .set({ twoFactorEnabled: enabled })
    .where(eq(user.id, userId))
}

async function openGrant(organizationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(breakGlassGrant)
    .where(
      and(
        eq(breakGlassGrant.organizationId, organizationId),
        eq(breakGlassGrant.userId, userId)
      )
    )
    .orderBy(breakGlassGrant.createdAt)
  return row
}

beforeAll(async () => {
  fixture = await createFixture("break-glass")
  rootAdmin = await fixture.createUser("root-admin")
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: fixture.root.id,
    userId: rootAdmin.id,
    role: "admin",
    createdAt: new Date(),
  })

  clientA = `break-glass-${fixture.suffix}`
  await db.insert(oauthClient).values({
    id: clientA,
    clientId: clientA,
    name: clientA,
    redirectUris: ["https://app.example.test/callback"],
    referenceId: fixture.orgA.id,
    metadata: { clientId: clientA, organizationId: fixture.orgA.id },
    createdAt: new Date(),
  })
})

afterAll(async () => {
  await fixture.cleanup()
})

describe("who may open it", () => {
  test("not a root administrator without a second factor", async () => {
    await giveSecondFactor(fixture.rootOwner.id, false)
    await actAs(fixture.rootOwner)

    const result = await startBreakGlass({
      organizationId: fixture.orgA.id,
      reason: REASON,
    })
    expect(result.success).toBe(false)
    expect(
      await openGrant(fixture.orgA.id, fixture.rootOwner.id)
    ).toBeUndefined()
  })

  test("not a tenant owner reaching into another tenant", async () => {
    await giveSecondFactor(fixture.alice.id)
    await actAs(fixture.alice)

    expect(
      (
        await startBreakGlass({
          organizationId: fixture.orgB.id,
          reason: REASON,
        })
      ).success
    ).toBe(false)
    expect(membershipIn(await getAccessContext(), fixture.orgB.id)).toBeNull()
  })

  test("not into the root organization or a suspended one", async () => {
    await giveSecondFactor(rootAdmin.id)
    await actAs(rootAdmin)

    expect(
      (
        await startBreakGlass({
          organizationId: fixture.root.id,
          reason: REASON,
        })
      ).success
    ).toBe(false)

    await db
      .update(organization)
      .set({ status: "suspended" })
      .where(eq(organization.id, fixture.orgB.id))
    try {
      expect(
        (
          await startBreakGlass({
            organizationId: fixture.orgB.id,
            reason: REASON,
          })
        ).success
      ).toBe(false)
    } finally {
      await db
        .update(organization)
        .set({ status: "active" })
        .where(eq(organization.id, fixture.orgB.id))
    }
  })

  test("not without a reason", async () => {
    await actAs(rootAdmin)
    expect(
      (await startBreakGlass({ organizationId: fixture.orgA.id, reason: "" }))
        .success
    ).toBe(false)
  })
})

describe("while it is open", () => {
  test("a root administrator acts as owner, visibly", async () => {
    await actAs(rootAdmin)
    discardDeferred()
    const mailed = outbox.length

    expect(
      await startBreakGlass({ organizationId: fixture.orgA.id, reason: REASON })
    ).toEqual({ success: true, slug: fixture.orgA.slug })

    const held = membershipIn(await getAccessContext(), fixture.orgA.id)
    expect(held?.role).toBe("owner")
    expect(held?.breakGlass?.reason).toBe(REASON)
    // Organization B was never opened.
    expect(membershipIn(await getAccessContext(), fixture.orgB.id)).toBeNull()

    // The owners are told, with the reason.
    await runDeferred()
    const notice = outbox
      .slice(mailed)
      .find((mail) => mail.to.address === fixture.alice.email)
    expect(notice?.text).toContain(REASON)

    // An owner's act is allowed, and recorded as root's under the grant.
    expect(
      await setMemberRole(fixture.orgA.id, fixture.carol.id, "admin")
    ).toEqual({ success: true })
    const grant = await openGrant(fixture.orgA.id, rootAdmin.id)
    const [changed] = await db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.organizationId, fixture.orgA.id),
          eq(auditEvent.action, "organization.member_role_changed"),
          eq(auditEvent.actorUserId, rootAdmin.id)
        )
      )
    expect(changed?.actorOrganizationId).toBe(fixture.root.id)
    expect(changed?.scope).toBe("platform")
    expect(changed?.metadata?.breakGlassGrantId).toBe(grant?.id)

    // The start is in the organization's own log too.
    const [started] = await db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.organizationId, fixture.orgA.id),
          eq(auditEvent.action, "organization.break_glass_started"),
          eq(auditEvent.outcome, "success")
        )
      )
    expect(started?.reason).toBe(REASON)
  })

  test("never reaches an application's token", async () => {
    await expect(
      resolveApplicationAccess(rootAdmin.id, clientA)
    ).rejects.toThrow("Not a member")
  })

  test("grants nothing once the second factor is gone", async () => {
    await giveSecondFactor(rootAdmin.id, false)
    try {
      await actAs(rootAdmin)
      expect(membershipIn(await getAccessContext(), fixture.orgA.id)).toBeNull()
    } finally {
      await giveSecondFactor(rootAdmin.id)
    }
  })

  test("grants nothing once root administration is gone", async () => {
    await db
      .update(member)
      .set({ role: "member" })
      .where(
        and(
          eq(member.organizationId, fixture.root.id),
          eq(member.userId, rootAdmin.id)
        )
      )
    try {
      await actAs(rootAdmin)
      expect(membershipIn(await getAccessContext(), fixture.orgA.id)).toBeNull()
    } finally {
      await db
        .update(member)
        .set({ role: "admin" })
        .where(
          and(
            eq(member.organizationId, fixture.root.id),
            eq(member.userId, rootAdmin.id)
          )
        )
    }
  })
})

describe("how it ends", () => {
  test("on its own when it expires", async () => {
    await actAs(rootAdmin)
    const grant = await openGrant(fixture.orgA.id, rootAdmin.id)
    await db
      .update(breakGlassGrant)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(breakGlassGrant.id, grant?.id ?? ""))

    expect(membershipIn(await getAccessContext(), fixture.orgA.id)).toBeNull()
  })

  test("or when its holder ends it, which is audited", async () => {
    await actAs(rootAdmin)
    expect(
      (
        await startBreakGlass({
          organizationId: fixture.orgA.id,
          reason: REASON,
        })
      ).success
    ).toBe(true)
    expect(membershipIn(await getAccessContext(), fixture.orgA.id)).not.toBe(
      null
    )

    expect(await endBreakGlass(fixture.orgA.id)).toEqual({ success: true })
    expect(membershipIn(await getAccessContext(), fixture.orgA.id)).toBeNull()

    const [ended] = await db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.organizationId, fixture.orgA.id),
          eq(auditEvent.action, "organization.break_glass_ended")
        )
      )
    expect(ended?.actorUserId).toBe(rootAdmin.id)

    // Nothing left to end.
    expect((await endBreakGlass(fixture.orgA.id)).success).toBe(false)
  })
})
