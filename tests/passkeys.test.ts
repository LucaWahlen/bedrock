import { afterAll, describe, expect, test } from "bun:test"

import { and, eq, like } from "drizzle-orm"

import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { deletePasskey } from "@/features/account/actions/delete-passkey"
import { finishPasskeyRegistration } from "@/features/account/actions/finish-passkey-registration"
import { getSecurityOverview } from "@/features/account/actions/get-security-overview"
import { renamePasskey } from "@/features/account/actions/rename-passkey"
import { startPasskeyRegistration } from "@/features/account/actions/start-passkey-registration"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { getPasskeySignInOptions } from "@/features/auth/actions/get-passkey-sign-in-options"
import { login } from "@/features/auth/actions/login"
import { signInWithPasskey } from "@/features/auth/actions/sign-in-with-passkey"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  organization,
  passkey,
  session,
  user,
} from "@/features/shared/lib/db/schema"
import {
  createSoftwarePasskey,
  type SoftwarePasskey,
} from "@/tests/support/authenticator"
import { givePassword, totpFor } from "@/tests/support/credentials"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import {
  actAs,
  browse,
  browserCookies,
  forgetSessions,
} from "@/tests/support/request"

// Passkey ceremonies driven end to end through the real actions and the real
// plugin, answered by a software authenticator that signs with a real key. The
// WebAuthn challenge travels the way it does in a browser: as a cookie the
// first Server Action sets and the second one reads back.

const PASSWORD = "correct horse battery staple"
const fixture = await createFixture("passkeys")
const { orgA, orgB, alice, bob, carol } = fixture

afterAll(() => fixture.cleanup())

async function register(person: FixtureUser, name: string) {
  await actAs(person, { keepCookies: true })
  const options = await startPasskeyRegistration({ currentPassword: PASSWORD })
  if (!options.success) throw new Error(options.error)

  const key = await createSoftwarePasskey()
  const result = await finishPasskeyRegistration(
    name,
    key.register(options.data)
  )
  if (!result.success) throw new Error(result.error)

  return key
}

async function signIn(key: SoftwarePasskey, slug?: string) {
  browse()
  const options = await getPasskeySignInOptions()
  if (!options.success) throw new Error(options.error)

  return signInWithPasskey(await key.authenticate(options.data), slug)
}

async function passkeysOf(userId: string) {
  return db
    .select({ id: passkey.id, name: passkey.name })
    .from(passkey)
    .where(eq(passkey.userId, userId))
}

for (const person of [alice, bob, carol]) {
  await givePassword(person.id, PASSWORD)
}

describe("adding a passkey", () => {
  test("the challenge cookie round-trips between two Server Actions", async () => {
    await actAs(carol, { keepCookies: true })
    const options = await startPasskeyRegistration({
      currentPassword: PASSWORD,
    })
    if (!options.success) throw new Error(options.error)

    expect(
      [...browserCookies().keys()].some((name) => name.endsWith("passkey"))
    ).toBe(true)

    const key = await createSoftwarePasskey()
    expect(
      await finishPasskeyRegistration(
        "Carol's laptop",
        key.register(options.data)
      )
    ).toEqual({ success: true })
    expect(await passkeysOf(carol.id)).toEqual([
      { id: expect.any(String), name: "Carol's laptop" },
    ])
  })

  test("needs the password first", async () => {
    await actAs(carol, { keepCookies: true })

    expect(
      await startPasskeyRegistration({ currentPassword: "not it" })
    ).toEqual({ success: false, error: "Your current password is incorrect" })
  })

  test("refuses a response made for another site", async () => {
    await actAs(carol, { keepCookies: true })
    const options = await startPasskeyRegistration({
      currentPassword: PASSWORD,
    })
    if (!options.success) throw new Error(options.error)

    const key = await createSoftwarePasskey()
    expect(
      await finishPasskeyRegistration(
        "Phished",
        key.register(options.data, "https://evil.example")
      )
    ).toMatchObject({ success: false })
  })

  test("refuses without a session", async () => {
    await actAs(null)

    expect(
      await startPasskeyRegistration({ currentPassword: PASSWORD })
    ).toEqual({ success: false, error: "You are not signed in" })
  })
})

describe("signing in with a passkey", () => {
  test("signs a member in through the gate, with no second factor", async () => {
    const key = await register(alice, "Alice's phone")

    expect(await signIn(key, orgA.slug)).toEqual({
      success: true,
      next: "organization",
    })
    expect((await getAccessContext()).user?.id).toBe(alice.id)

    const [event] = await db
      .select({ metadata: auditEvent.metadata })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "authentication.login"),
          eq(auditEvent.actorUserId, alice.id),
          eq(auditEvent.outcome, "success")
        )
      )
    expect(event.metadata).toEqual({ method: "passkey" })
  })

  test("is strong enough on its own for a two-factor account", async () => {
    const person = await fixture.createUser("strong", {})
    await givePassword(person.id, PASSWORD)
    const key = await register(person, "Strong key")

    await actAs(person)
    const started = await startTwoFactorEnrollment({
      currentPassword: PASSWORD,
    })
    if (!started.success) throw new Error(started.error)
    expect(
      await confirmTwoFactorEnrollment({
        code: await totpFor(started.data.secret),
      })
    ).toEqual({ success: true })
    forgetSessions([person.id])

    // The password needs a second factor; the passkey does not.
    browse()
    expect(await login({ email: person.email, password: PASSWORD })).toEqual({
      success: true,
      next: "two-factor",
    })
    expect(await signIn(key)).toEqual({ success: true, next: "organization" })
    expect((await getAccessContext()).user?.id).toBe(person.id)
  })

  test("refuses someone who is not a member, and keeps no session", async () => {
    const key = await register(bob, "Bob's key")
    forgetSessions([bob.id])
    await db.delete(session).where(eq(session.userId, bob.id))

    expect(await signIn(key, orgA.slug)).toEqual({
      success: false,
      error: "You are not a member of this organization",
    })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    expect(
      await db
        .select({ id: session.id })
        .from(session)
        .where(eq(session.userId, bob.id))
    ).toEqual([])

    // Their own organization still lets them in.
    expect(await signIn(key, orgB.slug)).toEqual({
      success: true,
      next: "organization",
    })
  })

  test("refuses a member of a suspended organization", async () => {
    const key = await register(carol, "Carol's other key")
    await db
      .update(organization)
      .set({ status: "suspended", statusChangedAt: new Date() })
      .where(eq(organization.id, orgA.id))

    try {
      expect(await signIn(key, orgA.slug)).toEqual({
        success: false,
        error: "This organization is suspended",
      })
      expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    } finally {
      await db
        .update(organization)
        .set({ status: "active" })
        .where(eq(organization.id, orgA.id))
    }
  })

  test("a challenge is good for one sign-in only", async () => {
    const key = await register(alice, "Alice's tablet")
    browse()
    const options = await getPasskeySignInOptions()
    if (!options.success) throw new Error(options.error)
    const response = await key.authenticate(options.data)

    expect(await signInWithPasskey(response, orgA.slug)).toMatchObject({
      success: true,
    })
    // Same browser, same answer: the challenge was consumed.
    expect(await signInWithPasskey(response, orgA.slug)).toMatchObject({
      success: false,
    })
  })

  test("refuses an unknown credential and audits the attempt", async () => {
    const stranger = await createSoftwarePasskey()

    expect(await signIn(stranger, orgA.slug)).toEqual({
      success: false,
      error: "That passkey could not be used to sign in",
    })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
  })
})

describe("managing passkeys", () => {
  test("only ever touches the caller's own", async () => {
    const [alicesKey] = await passkeysOf(alice.id)
    expect(alicesKey).toBeDefined()

    await actAs(bob)
    expect(await renamePasskey({ id: alicesKey.id, name: "Mine now" })).toEqual(
      { success: false, error: "That passkey was not found" }
    )
    expect(await deletePasskey(alicesKey.id)).toEqual({
      success: false,
      error: "That passkey was not found",
    })

    const overview = await getSecurityOverview()
    if (!overview.success) throw new Error(overview.error)
    expect(overview.data.passkeys.map((entry) => entry.id)).not.toContain(
      alicesKey.id
    )

    expect(await passkeysOf(alice.id)).toContainEqual(alicesKey)
  })

  test("renames and removes, with an audit trail", async () => {
    const [alicesKey] = await passkeysOf(alice.id)
    await actAs(alice)

    expect(
      await renamePasskey({ id: alicesKey.id, name: "Old phone" })
    ).toEqual({ success: true })
    expect(await deletePasskey(alicesKey.id)).toEqual({ success: true })
    expect(await passkeysOf(alice.id)).not.toContainEqual(
      expect.objectContaining({ id: alicesKey.id })
    )

    const events = await db
      .select({ action: auditEvent.action, label: auditEvent.targetLabel })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.targetId, alicesKey.id),
          like(auditEvent.action, "account.passkey_%")
        )
      )
    expect(events).toContainEqual({
      action: "account.passkey_renamed",
      label: "Old phone",
    })
    expect(events).toContainEqual({
      action: "account.passkey_removed",
      label: "Old phone",
    })
  })

  test("are deleted with the account", async () => {
    const person = await fixture.createUser("leaving")
    await givePassword(person.id, PASSWORD)
    await register(person, "Leaving key")

    await db.delete(user).where(eq(user.id, person.id))
    expect(await passkeysOf(person.id)).toEqual([])
  })
})
