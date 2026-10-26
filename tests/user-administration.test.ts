import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { deleteUser } from "@/features/account/actions/delete-user"
import { markUserVerified } from "@/features/organizations/actions/mark-user-verified"
import { resetUserSecondFactor } from "@/features/organizations/actions/reset-user-second-factor"
import { sendUserPasswordReset } from "@/features/organizations/actions/send-user-password-reset"
import { sendUserVerification } from "@/features/organizations/actions/send-user-verification"
import { signOutUser } from "@/features/organizations/actions/sign-out-user"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  member,
  session,
  user,
} from "@/features/shared/lib/db/schema"
import {
  createFixture,
  type Fixture,
  type FixtureUser,
} from "@/tests/support/fixtures"
import { outbox } from "@/tests/support/mail"
import {
  actAs,
  discardDeferred,
  forgetSessions,
  runDeferred,
} from "@/tests/support/request"

// Root supporting someone's account from the Directory. Each act is narrow on
// purpose: nothing here lets root read a secret, change an address or keep a
// way in, and the strongest acts need a session that is not just a password.

let fixture: Fixture
let rootAdmin: FixtureUser
let dave: FixtureUser

async function account(userId: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId))
  return row
}

async function setSecondFactor(userId: string, enabled: boolean) {
  await db
    .update(user)
    .set({ twoFactorEnabled: enabled })
    .where(eq(user.id, userId))
}

beforeAll(async () => {
  fixture = await createFixture("user-admin")
  rootAdmin = await fixture.createUser("root-admin")
  dave = await fixture.createUser("dave")
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: fixture.root.id,
    userId: rootAdmin.id,
    role: "admin",
    createdAt: new Date(),
  })
})

afterAll(async () => {
  await fixture.cleanup()
})

describe("who may administer an account", () => {
  test("not a tenant owner, even over their own member", async () => {
    await actAs(fixture.alice)

    expect((await sendUserPasswordReset(fixture.carol.id)).success).toBe(false)
  })

  test("not a root administrator over their own account", async () => {
    await actAs(rootAdmin)
    expect((await sendUserPasswordReset(rootAdmin.id)).success).toBe(false)
  })

  test("not a root admin over a root owner's account, but a root owner over a root admin's", async () => {
    await actAs(rootAdmin)
    expect(await sendUserPasswordReset(fixture.rootOwner.id)).toEqual({
      success: false,
      error: "Only a root owner can manage the account of a root administrator",
    })

    await actAs(fixture.rootOwner)
    expect(await sendUserPasswordReset(rootAdmin.id)).toEqual({
      success: true,
    })
  })
})

describe("supporting an account", () => {
  test("resending verification goes to the account, not the administrator", async () => {
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, dave.id))
    await actAs(rootAdmin)
    const sent = outbox.length

    expect(await sendUserVerification(dave.id)).toEqual({ success: true })
    expect(
      outbox.slice(sent).some((mail) => mail.to.address === dave.email)
    ).toBe(true)
  })

  test("marking an address verified, once", async () => {
    await actAs(rootAdmin)

    expect(await markUserVerified(dave.id)).toEqual({ success: true })
    expect((await account(dave.id))?.emailVerified).toBe(true)
    expect((await markUserVerified(dave.id)).success).toBe(false)
  })

  test("a password reset link goes to the account's own address", async () => {
    await actAs(rootAdmin)
    const sent = outbox.length

    expect(await sendUserPasswordReset(dave.id)).toEqual({ success: true })
    const mail = outbox.slice(sent).find((m) => m.to.address === dave.email)
    expect(mail).toBeDefined()
  })
})

describe("acts that need the administrator's own second factor", () => {
  test("are refused to a session without one", async () => {
    await setSecondFactor(rootAdmin.id, false)
    await actAs(rootAdmin)

    expect(await signOutUser(dave.id)).toEqual({
      success: false,
      error: "Set up a second factor on your own account first",
    })
    expect((await resetUserSecondFactor(dave.id)).success).toBe(false)
    expect((await deleteUser(dave.id)).success).toBe(false)
    expect(await account(dave.id)).toBeDefined()
  })

  test("signing out ends every session", async () => {
    await setSecondFactor(rootAdmin.id, true)
    await actAs(dave)
    await actAs(rootAdmin)

    expect(await signOutUser(dave.id)).toEqual({ success: true })
    expect(
      await db.select().from(session).where(eq(session.userId, dave.id))
    ).toEqual([])
    forgetSessions([dave.id])
  })

  test("resetting a second factor turns it off and tells the person", async () => {
    await setSecondFactor(dave.id, true)
    await actAs(rootAdmin)
    discardDeferred()
    const sent = outbox.length

    expect(await resetUserSecondFactor(dave.id)).toEqual({ success: true })
    expect((await account(dave.id))?.twoFactorEnabled).toBe(false)

    await runDeferred()
    expect(
      outbox.slice(sent).some((mail) => mail.to.address === dave.email)
    ).toBe(true)
  })

  test("deleting refuses the last owner of an organization", async () => {
    await actAs(rootAdmin)

    const refused = await deleteUser(fixture.alice.id)
    expect(refused.success).toBe(false)
    expect(
      !refused.success && refused.soleOwnedOrganizations?.map((o) => o.id)
    ).toEqual([fixture.orgA.id])
    expect(await account(fixture.alice.id)).toBeDefined()
  })

  test("deleting anyone else removes the account and audits who it was", async () => {
    await actAs(rootAdmin)

    expect(await deleteUser(fixture.carol.id)).toEqual({ success: true })
    expect(await account(fixture.carol.id)).toBeUndefined()

    const [deleted] = await db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "user.deleted"),
          eq(auditEvent.targetId, fixture.carol.id),
          eq(auditEvent.outcome, "success")
        )
      )
    expect(deleted?.metadata).toEqual({
      name: fixture.carol.name,
      email: fixture.carol.email,
    })
    forgetSessions([fixture.carol.id])
  })
})
