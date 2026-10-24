import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq, like } from "drizzle-orm"

import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { deleteAccount } from "@/features/account/actions/delete-account"
import { disableTwoFactor } from "@/features/account/actions/disable-two-factor"
import { getSecurityOverview } from "@/features/account/actions/get-security-overview"
import { regenerateBackupCodes } from "@/features/account/actions/regenerate-backup-codes"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { getPendingTwoFactor } from "@/features/auth/actions/get-pending-two-factor"
import { login } from "@/features/auth/actions/login"
import { verifyTwoFactor } from "@/features/auth/actions/verify-two-factor"
import { signInAndAcceptInvitation } from "@/features/organizations/actions/sign-in-and-accept-invitation"
import { createInvitationToken } from "@/features/organizations/lib/invitations"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  member,
  organization,
  session,
  twoFactor,
  user,
  verification,
} from "@/features/shared/lib/db/schema"
import { resetTwoFactor } from "@/scripts/admin/users"
import { givePassword, totpFor } from "@/tests/support/credentials"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import {
  actAs,
  browse,
  browserCookies,
  forgetSessions,
} from "@/tests/support/request"

// Runs against the development database from `compose.yaml`. Every sign-in
// here goes through the real actions and the real two-factor plugin, carrying
// cookies from one step to the next as a browser would.

const PASSWORD = "correct horse battery staple"
const fixture = await createFixture("two-factor")
const { orgA, orgB } = fixture

type Enrolled = FixtureUser & { secret: string; backupCodes: string[] }

async function addMember(organizationId: string, userId: string) {
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role: "member",
    createdAt: new Date(),
  })
}

// A user with a password and two-factor authentication turned on through the
// Security section's own actions, then signed out.
async function enrolledUser(label: string, organizationId?: string) {
  const person = await fixture.createUser(label)
  await givePassword(person.id, PASSWORD)
  if (organizationId) await addMember(organizationId, person.id)

  await actAs(person)
  const started = await startTwoFactorEnrollment({ currentPassword: PASSWORD })
  if (!started.success) throw new Error(started.error)
  const confirmed = await confirmTwoFactorEnrollment({
    code: await totpFor(started.data.secret),
  })
  if (!confirmed.success) throw new Error(confirmed.error)

  // Enabling replaced the session the harness had cached for them.
  forgetSessions([person.id])

  return {
    ...person,
    secret: started.data.secret,
    backupCodes: started.data.backupCodes,
  } satisfies Enrolled
}

// Signs in with the password on a fresh browser, leaving it at the second step.
async function signInWithPassword(person: FixtureUser, slug?: string) {
  browse()
  return login({ email: person.email, password: PASSWORD }, slug)
}

function hasSessionCookie() {
  return [...browserCookies().keys()].some((name) =>
    name.endsWith("session_token")
  )
}

async function loginEvents(userId: string) {
  return db
    .select({
      outcome: auditEvent.outcome,
      reason: auditEvent.reason,
      metadata: auditEvent.metadata,
      organizationId: auditEvent.organizationId,
    })
    .from(auditEvent)
    .where(
      and(
        eq(auditEvent.action, "authentication.login"),
        eq(auditEvent.actorUserId, userId)
      )
    )
}

let dana: Enrolled

beforeAll(async () => {
  dana = await enrolledUser("dana", orgA.id)
})

afterAll(async () => {
  // Pending challenges and trusted devices name the user by id.
  await db
    .delete(verification)
    .where(like(verification.value, `test-two-factor-${fixture.suffix}-%`))
  await fixture.cleanup()
})

describe("enrolling", () => {
  test("is only switched on by a verified code", async () => {
    const person = await fixture.createUser("enrolling")
    await givePassword(person.id, PASSWORD)
    await actAs(person)

    const started = await startTwoFactorEnrollment({
      currentPassword: PASSWORD,
    })
    if (!started.success) throw new Error(started.error)
    expect(started.data.totpURI).toStartWith("otpauth://totp/")
    expect(started.data.backupCodes).toHaveLength(10)

    const [pending] = await db
      .select({ enabled: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, person.id))
    expect(pending.enabled).toBe(false)

    expect(await confirmTwoFactorEnrollment({ code: "000000" })).toMatchObject({
      success: false,
    })

    // Not on yet, so the password alone still signs in.
    expect(await signInWithPassword(person)).toEqual({
      success: true,
      next: "organization",
    })
  })

  test("refuses a wrong password", async () => {
    const person = await fixture.createUser("wrong-password")
    await givePassword(person.id, PASSWORD)
    await actAs(person)

    expect(
      await startTwoFactorEnrollment({ currentPassword: "not it" })
    ).toEqual({ success: false, error: "Your current password is incorrect" })
  })

  test("cannot be restarted over an enabled secret", async () => {
    await actAs(dana)

    expect(
      await startTwoFactorEnrollment({ currentPassword: PASSWORD })
    ).toMatchObject({ success: false })
    forgetSessions([dana.id])
  })
})

describe("signing in with a second factor", () => {
  test("a correct password alone grants nothing", async () => {
    expect(await signInWithPassword(dana, orgA.slug)).toEqual({
      success: true,
      next: "two-factor",
    })

    // The pending challenge names who is signing in, and nothing more.
    expect(hasSessionCookie()).toBe(false)
    expect((await getPendingTwoFactor())?.id).toBe(dana.id)
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    expect(await getSecurityOverview()).toEqual({
      success: false,
      error: "You are not signed in",
    })
  })

  test("the same holds without an organization, as on the OIDC screens", async () => {
    expect(await signInWithPassword(dana)).toEqual({
      success: true,
      next: "two-factor",
    })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
  })

  test("an invitation's password sign-in does not accept anything yet", async () => {
    const person = await enrolledUser("invited")
    const { token, tokenHash } = createInvitationToken()
    await db.insert(invitation).values({
      id: crypto.randomUUID(),
      organizationId: orgB.id,
      email: person.email,
      role: "member",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastSentAt: new Date(),
      inviterId: fixture.bob.id,
      tokenHash,
    })

    browse()
    expect(await signInAndAcceptInvitation(token, PASSWORD)).toEqual({
      success: true,
      slug: orgB.slug,
      next: "two-factor",
    })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })

    const memberships = await db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.userId, person.id))
    expect(memberships).toEqual([])

    // Finishing the second step sends them back to accept it with a session.
    expect(
      await verifyTwoFactor(
        { method: "totp", code: await totpFor(person.secret) },
        orgB.slug
      )
    ).toEqual({ success: true, next: "invitation" })
  })

  test("an authenticator code completes it through the gate", async () => {
    await signInWithPassword(dana, orgA.slug)

    expect(
      await verifyTwoFactor(
        { method: "totp", code: await totpFor(dana.secret) },
        orgA.slug
      )
    ).toEqual({ success: true, next: "organization" })

    const context = await getAccessContext()
    expect(context.user?.id).toBe(dana.id)
    expect(await getPendingTwoFactor()).toBeNull()

    const events = await loginEvents(dana.id)
    expect(events).toContainEqual({
      outcome: "success",
      reason: null,
      metadata: { secondFactor: "totp" },
      organizationId: orgA.id,
    })
  })

  test("without a pending sign-in there is nothing to verify", async () => {
    browse()

    expect(
      await verifyTwoFactor(
        { method: "totp", code: await totpFor(dana.secret) },
        orgA.slug
      )
    ).toMatchObject({ success: false, expired: true })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
  })

  test("a backup code works exactly once", async () => {
    const person = await enrolledUser("backup", orgA.id)
    const [code] = person.backupCodes

    await signInWithPassword(person, orgA.slug)
    expect(
      await verifyTwoFactor({ method: "backup_code", code }, orgA.slug)
    ).toEqual({ success: true, next: "organization" })

    await signInWithPassword(person, orgA.slug)
    expect(
      await verifyTwoFactor({ method: "backup_code", code }, orgA.slug)
    ).toMatchObject({ success: false })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
  })

  test("wrong codes are audited and then rate limited", async () => {
    const person = await enrolledUser("throttled", orgA.id)
    await signInWithPassword(person, orgA.slug)

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await verifyTwoFactor(
        { method: "backup_code", code: "aaaaa-bbbbb" },
        orgA.slug
      )
      expect(result).toMatchObject({ success: false })
    }

    // Refused before the code is even looked at, the right one included.
    const blocked = await verifyTwoFactor(
      { method: "totp", code: await totpFor(person.secret) },
      orgA.slug
    )
    expect(blocked).toMatchObject({ success: false })
    expect(blocked.success ? "" : blocked.error).toStartWith(
      "Too many attempts"
    )
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })

    const events = await loginEvents(person.id)
    expect(events.filter((event) => event.outcome === "failure")).toHaveLength(
      5
    )
    expect(events.filter((event) => event.outcome === "denied")).toHaveLength(1)
  })
})

describe("the gate after a second factor", () => {
  test("refuses someone who is not a member, and keeps no session", async () => {
    const person = await enrolledUser("outsider", orgA.id)
    // Signed out everywhere, so any session left afterwards is this sign-in's.
    await db.delete(session).where(eq(session.userId, person.id))

    expect(await signInWithPassword(person, orgB.slug)).toEqual({
      success: true,
      next: "two-factor",
    })
    expect(
      await verifyTwoFactor(
        { method: "totp", code: await totpFor(person.secret) },
        orgB.slug
      )
    ).toEqual({
      success: false,
      error: "You are not a member of this organization",
    })

    expect(hasSessionCookie()).toBe(false)
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    const sessions = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.userId, person.id))
    expect(sessions).toEqual([])

    const events = await loginEvents(person.id)
    expect(events).toContainEqual({
      outcome: "denied",
      reason: "You are not a member of this organization",
      metadata: { secondFactor: "totp" },
      organizationId: orgB.id,
    })
  })

  test("refuses a member of a suspended organization", async () => {
    const suspendedId = `test-two-factor-${fixture.suffix}-suspended`
    fixture.trackOrganization(suspendedId)
    await db.insert(organization).values({
      id: suspendedId,
      name: `Suspended ${fixture.suffix}`,
      slug: `test-two-factor-suspended-${fixture.suffix}`,
      color: "#7c3aed",
      status: "suspended",
      createdAt: new Date(),
    })
    const person = await enrolledUser("suspended", suspendedId)

    await signInWithPassword(
      person,
      `test-two-factor-suspended-${fixture.suffix}`
    )
    expect(
      await verifyTwoFactor(
        { method: "totp", code: await totpFor(person.secret) },
        `test-two-factor-suspended-${fixture.suffix}`
      )
    ).toEqual({ success: false, error: "This organization is suspended" })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
  })
})

describe("managing two-factor authentication", () => {
  test("new backup codes replace every old one", async () => {
    const person = await enrolledUser("regenerate", orgA.id)
    await actAs(person)

    const regenerated = await regenerateBackupCodes({
      currentPassword: PASSWORD,
    })
    if (!regenerated.success) throw new Error(regenerated.error)
    expect(regenerated.data).toHaveLength(10)

    await signInWithPassword(person, orgA.slug)
    expect(
      await verifyTwoFactor(
        { method: "backup_code", code: person.backupCodes[0] },
        orgA.slug
      )
    ).toMatchObject({ success: false })
    expect(
      await verifyTwoFactor(
        { method: "backup_code", code: regenerated.data[0] },
        orgA.slug
      )
    ).toEqual({ success: true, next: "organization" })
  })

  test("turning it off takes the password and a code", async () => {
    const person = await enrolledUser("disable", orgA.id)
    await actAs(person)

    expect(
      await disableTwoFactor({ currentPassword: PASSWORD, code: "000000" })
    ).toMatchObject({ success: false })
    expect(
      await disableTwoFactor({
        currentPassword: "not it",
        code: await totpFor(person.secret),
      })
    ).toEqual({ success: false, error: "Your current password is incorrect" })
    expect(
      await disableTwoFactor({
        currentPassword: PASSWORD,
        code: await totpFor(person.secret),
      })
    ).toEqual({ success: true })
    forgetSessions([person.id])

    expect(await signInWithPassword(person, orgA.slug)).toEqual({
      success: true,
      next: "organization",
    })
  })

  test("deleting the account asks for a code as well", async () => {
    const person = await enrolledUser("delete")
    await actAs(person)

    expect(await deleteAccount({ currentPassword: PASSWORD })).toEqual({
      success: false,
      error: "Enter a code from your authenticator app or a backup code",
    })
    expect(
      await deleteAccount({ currentPassword: PASSWORD, code: "000000" })
    ).toMatchObject({ success: false })

    const [stillThere] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, person.id))
    expect(stillThere).toBeDefined()

    expect(
      await deleteAccount({
        currentPassword: PASSWORD,
        code: person.backupCodes[0],
      })
    ).toEqual({ success: true })
  })

  test("the admin script resets it for recovery, and audits it", async () => {
    const person = await enrolledUser("recovery", orgA.id)

    expect(await resetTwoFactor(person)).toEqual({ ok: true })

    const [account] = await db
      .select({ enabled: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, person.id))
    expect(account.enabled).toBe(false)
    expect(
      await db
        .select({ id: twoFactor.id })
        .from(twoFactor)
        .where(eq(twoFactor.userId, person.id))
    ).toEqual([])

    const [event] = await db
      .select({
        actorType: auditEvent.actorType,
        scope: auditEvent.scope,
      })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "account.two_factor_reset"),
          eq(auditEvent.targetId, person.id)
        )
      )
    expect(event).toEqual({ actorType: "system", scope: "platform" })

    expect(await signInWithPassword(person, orgA.slug)).toEqual({
      success: true,
      next: "organization",
    })
  })
})
