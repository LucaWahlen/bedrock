import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq, inArray, like, ne } from "drizzle-orm"

import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { finishPasskeyRegistration } from "@/features/account/actions/finish-passkey-registration"
import { startPasskeyRegistration } from "@/features/account/actions/start-passkey-registration"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { getPasskeySignInOptions } from "@/features/auth/actions/get-passkey-sign-in-options"
import { login } from "@/features/auth/actions/login"
import { signInWithPasskey } from "@/features/auth/actions/sign-in-with-passkey"
import { verifyTwoFactor } from "@/features/auth/actions/verify-two-factor"
import { ACCOUNT_DISABLED_MESSAGE } from "@/features/auth/lib/account-disabled"
import { auth } from "@/features/auth/lib/auth"
import { memberHasRole } from "@/features/auth/lib/member-role"
import { disableAccount } from "@/features/organizations/actions/disable-account"
import { enableAccount } from "@/features/organizations/actions/enable-account"
import { getAccountDisablePreview } from "@/features/organizations/actions/get-account-disable-preview"
import { getDirectory } from "@/features/organizations/actions/get-directory"
import { signInAndAcceptInvitation } from "@/features/organizations/actions/sign-in-and-accept-invitation"
import { changeAccountStanding } from "@/features/organizations/lib/account-standing"
import { createInvitationToken } from "@/features/organizations/lib/invitations"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  member,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  session,
  user,
  verification,
} from "@/features/shared/lib/db/schema"
import {
  authorizationRefusal,
  resolveApplicationAccess,
} from "@/features/shared/lib/oidc-claims"
import { disableUser, enableUser } from "@/scripts/admin/users"
import {
  createSoftwarePasskey,
  type SoftwarePasskey,
} from "@/tests/support/authenticator"
import { givePassword, totpFor } from "@/tests/support/credentials"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import { outbox } from "@/tests/support/mail"
import {
  actAs,
  browse,
  discardDeferred,
  forgetSessions,
  runDeferred,
} from "@/tests/support/request"

// Disabling an account is the instance's sanction on one person. Driven through
// the real actions and every real sign-in path: only root administration may do
// it, it ends everything the account held at once, and nothing lets it back in
// until it is enabled again.

const PASSWORD = "correct horse battery staple"
const fixture = await createFixture("disable")
const { root, rootOwner, orgA, orgB, alice, bob } = fixture
const clientA = `test-disable-${fixture.suffix}-app-a`

let rita: FixtureUser
let tom: FixtureUser

async function addMember(organizationId: string, userId: string, role: string) {
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  })
}

async function memberOfA(label: string) {
  const person = await fixture.createUser(label)
  await givePassword(person.id, PASSWORD)
  await addMember(orgA.id, person.id, "member")

  return person
}

async function disabledAt(userId: string) {
  const [row] = await db
    .select({ disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))

  return row.disabledAt
}

async function deniedLogins(userId: string) {
  return db
    .select({ reason: auditEvent.reason })
    .from(auditEvent)
    .where(
      and(
        eq(auditEvent.action, "authentication.login"),
        eq(auditEvent.outcome, "denied"),
        eq(auditEvent.actorUserId, userId)
      )
    )
}

beforeAll(async () => {
  rita = await fixture.createUser("rita")
  await addMember(root.id, rita.id, "admin")
  tom = await memberOfA("tom")

  await db.insert(oauthClient).values({
    id: clientA,
    clientId: clientA,
    redirectUris: ["https://a.example.test/callback"],
    referenceId: orgA.id,
    createdAt: new Date(),
  })
})

afterAll(async () => {
  await db.delete(oauthClient).where(eq(oauthClient.clientId, clientA))
  await db
    .delete(verification)
    .where(like(verification.value, `test-disable-${fixture.suffix}-%`))
  await fixture.cleanup()
})

describe("who may disable an account", () => {
  test("not a visitor", async () => {
    await actAs(null)

    expect(await disableAccount({ userId: tom.id, reason: "Gone" })).toEqual({
      success: false,
      error: "You are not signed in",
    })
    expect(await disabledAt(tom.id)).toBeNull()
  })

  // Owning a tenant is not administering the instance.
  test("not a tenant owner", async () => {
    await actAs(alice)

    expect(await disableAccount({ userId: tom.id, reason: "Gone" })).toEqual({
      success: false,
      error: "Only root administrators can change account access",
    })
    expect(await getAccountDisablePreview(tom.id)).toMatchObject({
      success: false,
    })
    expect(await disabledAt(tom.id)).toBeNull()

    const [denied] = await db
      .select({ outcome: auditEvent.outcome, scope: auditEvent.scope })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "user.disabled"),
          eq(auditEvent.actorUserId, alice.id)
        )
      )
    expect(denied).toEqual({ outcome: "denied", scope: "platform" })
  })

  test("not oneself", async () => {
    await actAs(rootOwner)

    expect(
      await disableAccount({ userId: rootOwner.id, reason: "Leaving" })
    ).toEqual({ success: false, error: "You cannot disable your own account" })
    expect(await disabledAt(rootOwner.id)).toBeNull()
  })

  test("not a root owner, by a root admin", async () => {
    await actAs(rita)

    expect(
      await disableAccount({ userId: rootOwner.id, reason: "Leaving" })
    ).toEqual({
      success: false,
      error: "Only a root owner can disable another root owner",
    })
    expect(await disabledAt(rootOwner.id)).toBeNull()
  })

  test("never the last active root owner", async () => {
    class Rollback extends Error {}
    let refused: unknown

    // Every other root owner is disabled for the length of a transaction that
    // is then rolled back, so the instance's real owners are never touched.
    try {
      await db.transaction(async (tx) => {
        const rootOwners = tx
          .select({ userId: member.userId })
          .from(member)
          .where(
            and(
              eq(member.organizationId, root.id),
              memberHasRole(member.role, "owner")
            )
          )
        await tx
          .update(user)
          .set({ disabledAt: new Date() })
          .where(and(inArray(user.id, rootOwners), ne(user.id, rootOwner.id)))

        refused = await changeAccountStanding(tx, {
          userId: rootOwner.id,
          disable: { reason: "Leaving" },
          actor: { type: "system" },
          disabledBy: null,
        })
        throw new Rollback()
      })
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }

    expect(refused).toMatchObject({
      ok: false,
      error:
        "The last active owner of the root organization cannot be disabled",
    })
    expect(await disabledAt(rootOwner.id)).toBeNull()
  })

  test("a root administrator, who is warned about tenants left without an owner", async () => {
    // Bob is B's only owner.
    await actAs(rita)
    expect(await getAccountDisablePreview(bob.id)).toEqual({
      success: true,
      data: {
        name: bob.name,
        email: bob.email,
        disabled: false,
        soleOwnedOrganizations: [
          { id: orgB.id, name: orgB.name, slug: orgB.slug },
        ],
        refusal: null,
      },
    })

    expect(
      await disableAccount({ userId: bob.id, reason: "Investigating" })
    ).toEqual({
      success: true,
      soleOwnedOrganizations: [
        { id: orgB.id, name: orgB.name, slug: orgB.slug },
      ],
    })
    expect(await disabledAt(bob.id)).not.toBeNull()

    expect(await enableAccount(bob.id)).toEqual({ success: true })
    expect(await disabledAt(bob.id)).toBeNull()
  })
})

describe("disabling an account", () => {
  test("ends every session, token and consent with an audited statement", async () => {
    // A live browser session, and an application's grant, before.
    await actAs(tom)
    expect((await getAccessContext()).user?.id).toBe(tom.id)
    const now = new Date()
    await db.insert(oauthConsent).values({
      id: `${clientA}-consent`,
      clientId: clientA,
      userId: tom.id,
      scopes: ["openid"],
      createdAt: now,
    })
    await db.insert(oauthRefreshToken).values({
      id: `${clientA}-refresh`,
      token: `${clientA}-refresh`,
      clientId: clientA,
      userId: tom.id,
      scopes: ["openid"],
      createdAt: now,
    })
    await db.insert(oauthAccessToken).values({
      id: `${clientA}-access`,
      token: `${clientA}-access`,
      clientId: clientA,
      userId: tom.id,
      scopes: ["openid"],
      createdAt: now,
    })

    await actAs(rootOwner)
    discardDeferred()
    const mailed = outbox.length
    expect(
      await disableAccount({ userId: tom.id, reason: "Left the company" })
    ).toEqual({ success: true, soleOwnedOrganizations: [] })
    await runDeferred()
    const [notice] = outbox
      .slice(mailed)
      .filter((mail) => mail.to.address === tom.email)
    expect(notice?.subject).toMatch(/disabled/i)
    expect(notice?.text).toContain("Left the company")

    expect(
      await db.select().from(session).where(eq(session.userId, tom.id))
    ).toEqual([])
    expect(
      await db
        .select()
        .from(oauthAccessToken)
        .where(eq(oauthAccessToken.userId, tom.id))
    ).toEqual([])
    expect(
      await db
        .select()
        .from(oauthRefreshToken)
        .where(eq(oauthRefreshToken.userId, tom.id))
    ).toEqual([])
    expect(
      await db
        .select()
        .from(oauthConsent)
        .where(eq(oauthConsent.userId, tom.id))
    ).toEqual([])

    // The cookie the harness still holds now names nobody.
    await actAs(tom)
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })

    const [event] = await db
      .select({
        outcome: auditEvent.outcome,
        scope: auditEvent.scope,
        actorUserId: auditEvent.actorUserId,
        targetId: auditEvent.targetId,
        targetLabel: auditEvent.targetLabel,
        reason: auditEvent.reason,
        metadata: auditEvent.metadata,
      })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "user.disabled"),
          eq(auditEvent.targetId, tom.id),
          eq(auditEvent.outcome, "success")
        )
      )
    expect(event).toEqual({
      outcome: "success",
      scope: "platform",
      actorUserId: rootOwner.id,
      targetId: tom.id,
      targetLabel: tom.name,
      reason: "Left the company",
      metadata: { name: tom.name, email: tom.email },
    })
  })

  test("shows in the directory, and can be filtered on", async () => {
    await actAs(rootOwner)
    const result = await getDirectory({ search: tom.email })

    expect(result.people).toHaveLength(1)
    expect(result.people[0].disabled).toEqual({
      at: expect.any(String),
      reason: "Left the company",
    })
    expect(result.statusCounts).toEqual({ active: 0, disabled: 1 })
    expect(
      (await getDirectory({ search: tom.email, statuses: ["active"] })).people
    ).toEqual([])
  })

  test("cannot be done twice", async () => {
    await actAs(rootOwner)

    expect(await disableAccount({ userId: tom.id, reason: "Again" })).toEqual({
      success: false,
      error: "This account is already disabled",
    })
  })
})

describe("every way in refuses a disabled account", () => {
  test("a password", async () => {
    browse()

    expect(
      await login({ email: tom.email, password: PASSWORD }, orgA.slug)
    ).toEqual({ success: false, error: ACCOUNT_DISABLED_MESSAGE })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    expect(await deniedLogins(tom.id)).toContainEqual({
      reason: "Account is disabled",
    })
  })

  // Only the right password learns the account is disabled.
  test("a wrong password says only that it is wrong", async () => {
    browse()

    expect(
      await login({ email: tom.email, password: "not the password" }, orgA.slug)
    ).toEqual({ success: false, error: "Invalid email or password" })
  })

  test("an authenticator code after the password", async () => {
    const uma = await memberOfA("uma")
    await actAs(uma)
    const started = await startTwoFactorEnrollment({
      currentPassword: PASSWORD,
    })
    if (!started.success) throw new Error(started.error)
    const confirmed = await confirmTwoFactorEnrollment({
      code: await totpFor(started.data.secret),
    })
    if (!confirmed.success) throw new Error(confirmed.error)
    forgetSessions([uma.id])

    // Disabled while the second step is open.
    browse()
    expect(
      await login({ email: uma.email, password: PASSWORD }, orgA.slug)
    ).toEqual({ success: true, next: "two-factor" })
    expect(await disableUser(uma, "Lost laptop")).toEqual({
      ok: true,
      soleOwnerOf: [],
    })

    expect(
      await verifyTwoFactor(
        { method: "totp", code: await totpFor(started.data.secret) },
        orgA.slug
      )
    ).toEqual({ success: false, error: ACCOUNT_DISABLED_MESSAGE })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    expect(await deniedLogins(uma.id)).toContainEqual({
      reason: "Account is disabled",
    })
  })

  test("a passkey", async () => {
    const pia = await memberOfA("pia")
    await actAs(pia, { keepCookies: true })
    const options = await startPasskeyRegistration({
      currentPassword: PASSWORD,
    })
    if (!options.success) throw new Error(options.error)
    const key: SoftwarePasskey = await createSoftwarePasskey()
    const registered = await finishPasskeyRegistration(
      "Pia's key",
      key.register(options.data)
    )
    if (!registered.success) throw new Error(registered.error)

    await actAs(rootOwner)
    expect(
      await disableAccount({ userId: pia.id, reason: "Suspicious activity" })
    ).toMatchObject({ success: true })

    browse()
    const signInOptions = await getPasskeySignInOptions()
    if (!signInOptions.success) throw new Error(signInOptions.error)
    expect(
      await signInWithPasskey(
        await key.authenticate(signInOptions.data),
        orgA.slug
      )
    ).toEqual({ success: false, error: ACCOUNT_DISABLED_MESSAGE })
    expect(await getAccessContext()).toEqual({ user: null, memberships: [] })
    expect(await deniedLogins(pia.id)).toContainEqual({
      reason: "Account is disabled",
    })
  })

  test("signing in to accept an invitation", async () => {
    const { token, tokenHash } = createInvitationToken()
    await db.insert(invitation).values({
      id: crypto.randomUUID(),
      organizationId: orgB.id,
      email: tom.email,
      role: "member",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      lastSentAt: new Date(),
      inviterId: bob.id,
      tokenHash,
    })

    browse()
    expect(await signInAndAcceptInvitation(token, PASSWORD)).toEqual({
      success: false,
      error: ACCOUNT_DISABLED_MESSAGE,
    })
    expect(
      await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(eq(member.userId, tom.id), eq(member.organizationId, orgB.id))
        )
    ).toEqual([])
  })

  test("an application", async () => {
    expect(await authorizationRefusal(tom.id, clientA)).toEqual({
      reason: "account_disabled",
    })
    await expect(resolveApplicationAccess(tom.id, clientA)).rejects.toThrow(
      "Account is disabled"
    )
  })

  test("a password reset", async () => {
    const context = await auth.$context
    const resetToken = crypto.randomUUID()
    await context.internalAdapter.createVerificationValue({
      value: tom.id,
      identifier: `reset-password:${resetToken}`,
      expiresAt: new Date(Date.now() + 60_000),
    })
    const newPassword = "a different horse battery staple"
    await auth.api.resetPassword({ body: { token: resetToken, newPassword } })

    browse()
    expect(
      await login({ email: tom.email, password: newPassword }, orgA.slug)
    ).toEqual({ success: false, error: ACCOUNT_DISABLED_MESSAGE })
    expect(await disabledAt(tom.id)).not.toBeNull()

    // Back to the password the rest of the suite signs in with.
    await context.internalAdapter.updatePassword(
      tom.id,
      await context.password.hash(PASSWORD)
    )
  })
})

describe("enabling an account", () => {
  test("is refused to anyone but root administration", async () => {
    await actAs(alice)

    expect(await enableAccount(tom.id)).toEqual({
      success: false,
      error: "Only root administrators can change account access",
    })
    expect(await disabledAt(tom.id)).not.toBeNull()
  })

  test("lets the account sign in again, with its memberships", async () => {
    await actAs(rita)
    discardDeferred()
    const mailed = outbox.length
    expect(await enableAccount(tom.id)).toEqual({ success: true })
    await runDeferred()
    expect(
      outbox
        .slice(mailed)
        .some(
          (mail) =>
            mail.to.address === tom.email && /enabled/i.test(mail.subject)
        )
    ).toBe(true)

    const [event] = await db
      .select({ scope: auditEvent.scope, metadata: auditEvent.metadata })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "user.enabled"),
          eq(auditEvent.targetId, tom.id),
          eq(auditEvent.actorUserId, rita.id),
          eq(auditEvent.outcome, "success")
        )
      )
    expect(event).toEqual({
      scope: "platform",
      metadata: { name: tom.name, email: tom.email },
    })

    browse()
    expect(
      await login({ email: tom.email, password: PASSWORD }, orgA.slug)
    ).toEqual({ success: true, next: "organization" })
    const access = await getAccessContext()
    expect(access.user?.id).toBe(tom.id)
    expect(access.memberships.map((held) => held.organizationId)).toEqual([
      orgA.id,
    ])
  })

  test("from the admin script too, audited as the system", async () => {
    expect(await disableUser(tom, "Scripted")).toEqual({
      ok: true,
      soleOwnerOf: [],
    })
    expect(await enableUser(tom)).toEqual({ ok: true, soleOwnerOf: [] })
    expect(await enableUser(tom)).toEqual({
      ok: false,
      error: "This account is not disabled",
    })

    const events = await db
      .select({
        action: auditEvent.action,
        actorType: auditEvent.actorType,
        metadata: auditEvent.metadata,
      })
      .from(auditEvent)
      .where(
        and(eq(auditEvent.targetId, tom.id), eq(auditEvent.actorType, "system"))
      )
    expect(events).toContainEqual({
      action: "user.disabled",
      actorType: "system",
      metadata: { via: "admin script", name: tom.name, email: tom.email },
    })
    expect(events).toContainEqual({
      action: "user.enabled",
      actorType: "system",
      metadata: { via: "admin script", name: tom.name, email: tom.email },
    })
  })
})
