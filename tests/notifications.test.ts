import { afterAll, afterEach, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { changeEmail } from "@/features/account/actions/change-email"
import { changePassword } from "@/features/account/actions/change-password"
import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { deleteAccount } from "@/features/account/actions/delete-account"
import { deletePasskey } from "@/features/account/actions/delete-passkey"
import { disableTwoFactor } from "@/features/account/actions/disable-two-factor"
import { finishPasskeyRegistration } from "@/features/account/actions/finish-passkey-registration"
import { regenerateBackupCodes } from "@/features/account/actions/regenerate-backup-codes"
import { startPasskeyRegistration } from "@/features/account/actions/start-passkey-registration"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import { login } from "@/features/auth/actions/login"
import { verifyEmail } from "@/features/auth/actions/verify-email"
import {
  sendAccountDisabledNotice,
  sendAccountEnabledNotice,
} from "@/features/notifications"
import { detectNewSignIn } from "@/features/notifications/actions/detect-new-sign-in"
import { deviceFamily } from "@/features/notifications/utils/device-family"
import { maskEmail } from "@/features/notifications/utils/mask-email"
import { acceptInvitation } from "@/features/organizations/actions/accept-invitation"
import { addMembers } from "@/features/organizations/actions/add-members"
import { joinOrganization } from "@/features/organizations/actions/join-organization"
import { removeMember } from "@/features/organizations/actions/remove-member"
import { setMemberRole } from "@/features/organizations/actions/set-member-role"
import { signInAndAcceptInvitation } from "@/features/organizations/actions/sign-in-and-accept-invitation"
import { createInvitationToken } from "@/features/organizations/lib/invitations"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  member,
  organization,
  passkey,
  session,
  user,
} from "@/features/shared/lib/db/schema"
import type { EmailMessage } from "@/features/shared/lib/email/types"
import { createSoftwarePasskey } from "@/tests/support/authenticator"
import { givePassword, totpFor } from "@/tests/support/credentials"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import { outbox } from "@/tests/support/mail"
import {
  actAs,
  browse,
  discardDeferred,
  forgetSessions,
  runDeferred,
  TEST_USER_AGENT,
} from "@/tests/support/request"

// Every notice is sent after the response, through `after`, which the harness
// holds until `runDeferred`. So each case runs a real action, lets the response
// "finish", and reads what reached the outbox in between.

const PASSWORD = "correct horse battery staple"
const NEW_PASSWORD = "another horse, a different staple"
const TENANT_COLOR = "#0f766e"
const CHROME_ON_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"

const fixture = await createFixture("notifications")
const { root, orgA, orgB, alice, bob, carol } = fixture

// A colour no root organization is seeded with, so a tenant's branding is
// told apart from the instance's.
await db
  .update(organization)
  .set({ color: TENANT_COLOR })
  .where(eq(organization.id, orgA.id))

await givePassword(bob.id, PASSWORD)

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  discardDeferred()
})

afterAll(() => fixture.cleanup())

// Have I Been Pwned is never asked: every password here is "not found".
function stubBreachLookup() {
  globalThis.fetch = Object.assign(
    () => Promise.resolve(new Response("", { status: 200 })),
    { preconnect: realFetch.preconnect }
  ) as typeof fetch
}

// What an action mailed, synchronously or once its response was done.
async function mailedBy<T>(run: () => Promise<T>) {
  discardDeferred()
  const start = outbox.length
  const result = await run()
  await runDeferred()

  return { result, mails: outbox.slice(start) }
}

function to(mails: EmailMessage[], address: string) {
  return mails.filter((mail) => mail.to.address === address)
}

function only(mails: EmailMessage[], address: string) {
  const sent = to(mails, address)
  expect(sent).toHaveLength(1)

  return sent[0] as EmailMessage
}

function body(mail: EmailMessage) {
  return `${mail.subject}\n${mail.text}\n${mail.html}`
}

// Nothing a notice says can be used to act on the account.
function expectNoSecrets(mail: EmailMessage, secrets: string[] = []) {
  const content = body(mail)
  for (const secret of [PASSWORD, NEW_PASSWORD, ...secrets]) {
    expect(content).not.toContain(secret)
  }
  expect(content).not.toMatch(/token=/i)
}

function expectInstanceBranding(mail: EmailMessage) {
  expect(mail.html).toContain(root.name)
  expect(mail.html).not.toContain(TENANT_COLOR)
}

async function memberOf(
  organizationId: string,
  label: string,
  role = "member"
) {
  const person = await fixture.createUser(label)
  await givePassword(person.id, PASSWORD)
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId: person.id,
    role,
    createdAt: new Date(),
  })

  return person
}

async function recordSignInFrom(userId: string, userAgent: string) {
  await db.insert(auditEvent).values({
    id: crypto.randomUUID(),
    action: "authentication.login",
    outcome: "success",
    scope: "platform",
    actorType: "user",
    actorUserId: userId,
    userAgent,
  })
}

async function enrolTwoFactor(person: FixtureUser) {
  await actAs(person)
  const started = await startTwoFactorEnrollment({ currentPassword: PASSWORD })
  if (!started.success) throw new Error(started.error)

  const enrolled = await mailedBy(async () =>
    confirmTwoFactorEnrollment({ code: await totpFor(started.data.secret) })
  )
  // Enabling replaced the session the harness had cached for them.
  forgetSessions([person.id])

  return { ...started.data, ...enrolled }
}

describe("helpers", () => {
  test("an address is masked past recognition", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@e***.com")
    expect(maskEmail("x@y")).toBe("*@*")
  })

  test("a device is its browser and operating system", () => {
    expect(deviceFamily(CHROME_ON_MAC)).toBe("Chrome|macOS")
    expect(deviceFamily(CHROME_ON_MAC.replace("129.0.0.0", "131.0.0.0"))).toBe(
      "Chrome|macOS"
    )
    expect(deviceFamily(null)).toBeNull()
  })
})

describe("security notices", () => {
  test("a changed password is reported to its owner with the instance's branding", async () => {
    const person = await memberOf(orgA.id, "password")
    await actAs(person)
    stubBreachLookup()

    const { result, mails } = await mailedBy(() =>
      changePassword({
        currentPassword: PASSWORD,
        password: NEW_PASSWORD,
        revokeOtherSessions: false,
      })
    )

    expect(result).toEqual({ success: true })
    const mail = only(mails, person.email)
    expect(mail.subject).toBe("Your password was changed")
    expect(mail.text).toContain("UTC")
    expect(mail.text).toContain("IP address")
    expect(mail.text).toContain("contact your administrator")
    expect(mail.text).toContain(`/org/${orgA.slug}?account=security`)
    expectInstanceBranding(mail)
    expectNoSecrets(mail)
  })

  test("a refused password change sends nothing", async () => {
    const person = await memberOf(orgA.id, "password-refused")
    await actAs(person)
    stubBreachLookup()

    const { result, mails } = await mailedBy(() =>
      changePassword({
        currentPassword: "not the password",
        password: NEW_PASSWORD,
        revokeOtherSessions: false,
      })
    )

    expect(result.success).toBe(false)
    expect(mails).toEqual([])
  })

  test("an email change is reported to the old address, then confirmed", async () => {
    const person = await memberOf(orgA.id, "email")
    const newEmail = `moved-${fixture.suffix}@example.test`
    await actAs(person)

    const requested = await mailedBy(() =>
      changeEmail({ newEmail, currentPassword: PASSWORD }, orgA.slug)
    )

    expect(requested.result).toEqual({ success: true })
    const link = only(requested.mails, newEmail).text.match(
      /verify-email\?token=([^\s"&<>)\]]+)/
    )?.[1]
    if (!link) throw new Error("No confirmation link was mailed")
    const token = decodeURIComponent(link)

    const notice = only(requested.mails, person.email)
    expect(notice.subject).toBe(
      "A new email address was requested for your account"
    )
    expect(notice.text).toContain(maskEmail(newEmail))
    expect(body(notice)).not.toContain(newEmail)
    expectInstanceBranding(notice)
    expectNoSecrets(notice, [token, link])

    const confirmed = await mailedBy(() => verifyEmail(token))

    expect(confirmed.result).toEqual({ success: true })
    const changed = only(confirmed.mails, person.email)
    expect(changed.subject).toBe("Your email address was changed")
    expect(changed.text).toContain(maskEmail(newEmail))
    expect(to(confirmed.mails, newEmail)).toEqual([])
    expectNoSecrets(changed, [token, link])
  })

  test("a wrong password requests no email change and sends nothing", async () => {
    const person = await memberOf(orgA.id, "email-refused")
    await actAs(person)

    const { result, mails } = await mailedBy(() =>
      changeEmail(
        {
          newEmail: `never-${fixture.suffix}@example.test`,
          currentPassword: "not the password",
        },
        orgA.slug
      )
    )

    expect(result.success).toBe(false)
    expect(mails).toEqual([])
  })

  test("two-factor changes are reported without a secret or a code", async () => {
    const person = await memberOf(orgA.id, "two-factor")
    const enrolled = await enrolTwoFactor(person)

    const enabled = only(enrolled.mails, person.email)
    expect(enabled.subject).toBe("Two-factor authentication was turned on")
    expectInstanceBranding(enabled)
    expectNoSecrets(enabled, [enrolled.secret, ...enrolled.backupCodes])

    await actAs(person)
    const refused = await mailedBy(() =>
      regenerateBackupCodes({ currentPassword: "not the password" })
    )
    expect(refused.result.success).toBe(false)
    expect(refused.mails).toEqual([])

    const regenerated = await mailedBy(() =>
      regenerateBackupCodes({ currentPassword: PASSWORD })
    )
    if (!regenerated.result.success) throw new Error("No new backup codes")
    const codes = only(regenerated.mails, person.email)
    expect(codes.subject).toBe("New backup codes were created")
    expectNoSecrets(codes, [enrolled.secret, ...regenerated.result.data])

    const disabled = await mailedBy(async () =>
      disableTwoFactor({
        currentPassword: PASSWORD,
        code: await totpFor(enrolled.secret),
      })
    )
    expect(disabled.result).toEqual({ success: true })
    const off = only(disabled.mails, person.email)
    expect(off.subject).toBe("Two-factor authentication was turned off")
    expectNoSecrets(off, [enrolled.secret])
  })

  test("a refused two-factor enrolment sends nothing", async () => {
    const person = await memberOf(orgA.id, "two-factor-refused")
    await actAs(person)
    const started = await startTwoFactorEnrollment({
      currentPassword: PASSWORD,
    })
    if (!started.success) throw new Error(started.error)

    const { result, mails } = await mailedBy(() =>
      confirmTwoFactorEnrollment({ code: "000000" })
    )

    expect(result.success).toBe(false)
    expect(mails).toEqual([])
  })

  test("adding and removing a passkey are both reported", async () => {
    const person = await memberOf(orgA.id, "passkey")
    await actAs(person, { keepCookies: true })
    const options = await startPasskeyRegistration({
      currentPassword: PASSWORD,
    })
    if (!options.success) throw new Error(options.error)
    const key = await createSoftwarePasskey()

    const added = await mailedBy(() =>
      finishPasskeyRegistration("Work laptop", key.register(options.data))
    )

    expect(added.result).toEqual({ success: true })
    const addedMail = only(added.mails, person.email)
    expect(addedMail.subject).toBe("A passkey was added to your account")
    expect(addedMail.text).toContain("Work laptop")
    expectInstanceBranding(addedMail)
    expectNoSecrets(addedMail)

    const [stored] = await db
      .select({ id: passkey.id })
      .from(passkey)
      .where(eq(passkey.userId, person.id))
    if (!stored) throw new Error("The passkey was not stored")

    // Another account's passkey is indistinguishable from a missing one.
    await actAs(bob)
    const foreign = await mailedBy(() => deletePasskey(stored.id))
    expect(foreign.result.success).toBe(false)
    expect(foreign.mails).toEqual([])

    await actAs(person)
    const removed = await mailedBy(() => deletePasskey(stored.id))
    expect(removed.result).toEqual({ success: true })
    expect(only(removed.mails, person.email).subject).toBe(
      "A passkey was removed from your account"
    )
    expect(to(removed.mails, bob.email)).toEqual([])
  })

  test("a deleted account is told at the address it had", async () => {
    const person = await memberOf(orgA.id, "deleted")
    await actAs(person)

    const refused = await mailedBy(() =>
      deleteAccount({ currentPassword: "not the password" })
    )
    expect(refused.result.success).toBe(false)
    expect(refused.mails).toEqual([])

    const deleted = await mailedBy(() =>
      deleteAccount({ currentPassword: PASSWORD })
    )

    expect(deleted.result).toEqual({ success: true })
    const mail = only(deleted.mails, person.email)
    expect(mail.subject).toBe("Your account was deleted")
    expectInstanceBranding(mail)
    expectNoSecrets(mail)
  })

  test("account status notices name no secret and need no organization", async () => {
    const person = {
      name: "Dana",
      email: `dana-${fixture.suffix}@example.test`,
    }

    const { mails } = await mailedBy(async () => {
      await sendAccountDisabledNotice({ recipient: person, reason: "Audit" })
      await sendAccountEnabledNotice({
        recipient: person,
        organizationSlug: orgA.slug,
      })
    })

    const [disabled, enabled] = to(mails, person.email)
    expect(disabled?.subject).toBe("Your account was disabled")
    expect(disabled?.text).toContain("Audit")
    expect(enabled?.subject).toBe("Your account was enabled again")
    expect(enabled?.text).toContain(`/org/${orgA.slug}`)
  })
})

describe("new sign-in notices", () => {
  async function signIn(person: FixtureUser, slug = orgA.slug) {
    return mailedBy(async () => {
      browse()
      return login({ email: person.email, password: PASSWORD }, slug)
    })
  }

  test("a new account's first sign-in is not news", async () => {
    const person = await memberOf(orgA.id, "first-sign-in")

    const { result, mails } = await signIn(person)

    expect(result).toEqual({ success: true, next: "organization" })
    expect(to(mails, person.email)).toEqual([])
  })

  test("a device that signed in before is recognised", async () => {
    const person = await memberOf(orgA.id, "known-device")
    await recordSignInFrom(person.id, TEST_USER_AGENT)

    const { result, mails } = await signIn(person)

    expect(result.success).toBe(true)
    expect(to(mails, person.email)).toEqual([])
  })

  test("another live session on the same device is recognised", async () => {
    const person = await memberOf(orgA.id, "live-session")
    await recordSignInFrom(person.id, CHROME_ON_MAC)
    await db.insert(session).values({
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      userId: person.id,
      userAgent: TEST_USER_AGENT,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const { mails } = await signIn(person)

    expect(to(mails, person.email)).toEqual([])
  })

  test("an unrecognised device is reported to the account holder", async () => {
    const person = await memberOf(orgA.id, "new-device")
    await recordSignInFrom(person.id, CHROME_ON_MAC)

    const { result, mails } = await signIn(person)

    expect(result).toEqual({ success: true, next: "organization" })
    const mail = only(mails, person.email)
    expect(mail.subject).toBe("New sign-in to your account")
    expect(mail.text).toContain(orgA.name)
    expect(mail.text).toContain("IP address")
    expect(mail.text).toContain(`/org/${orgA.slug}?account=sessions`)
    expectInstanceBranding(mail)
    expectNoSecrets(mail)
  })

  test("a long-unused account with no history is reported too", async () => {
    const person = await memberOf(orgA.id, "dormant")
    const longAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    await db
      .update(user)
      .set({ createdAt: longAgo })
      .where(eq(user.id, person.id))

    const { mails } = await signIn(person)

    expect(only(mails, person.email).subject).toBe(
      "New sign-in to your account"
    )
  })

  test("a refused or failed sign-in sends nothing", async () => {
    await recordSignInFrom(bob.id, CHROME_ON_MAC)

    // Bob belongs to B, not A: the gate refuses him.
    const refused = await signIn(bob, orgA.slug)
    expect(refused.result).toEqual({
      success: false,
      error: "You are not a member of this organization",
    })
    expect(refused.mails).toEqual([])

    const failed = await mailedBy(async () => {
      browse()
      return login({ email: bob.email, password: "not it" }, orgB.slug)
    })
    expect(failed.result.success).toBe(false)
    expect(failed.mails).toEqual([])
  })

  test("signing in to accept an invitation passes the same gate", async () => {
    const person = await fixture.createUser("invited-sign-in")
    await givePassword(person.id, PASSWORD)
    await recordSignInFrom(person.id, CHROME_ON_MAC)
    const token = await invite(orgA.id, person.email, alice.id)

    const { result, mails } = await mailedBy(async () => {
      browse()
      return signInAndAcceptInvitation(token, PASSWORD)
    })

    expect(result).toEqual({ success: true, slug: orgA.slug })
    const notice = only(mails, person.email)
    expect(notice.subject).toBe("New sign-in to your account")
    // Not a member when it was sent, so it does not offer that organization.
    expect(notice.text).not.toContain(`/org/${orgA.slug}?account=sessions`)
    expectNoSecrets(notice, [token])

    const events = await db
      .select({
        outcome: auditEvent.outcome,
        organizationId: auditEvent.organizationId,
        metadata: auditEvent.metadata,
      })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "authentication.login"),
          eq(auditEvent.actorUserId, person.id),
          eq(auditEvent.organizationId, orgA.id)
        )
      )
    expect(events).toEqual([
      {
        outcome: "success",
        organizationId: orgA.id,
        metadata: { pendingInvitation: true },
      },
    ])
  })

  test("a wrong password at an invitation sends nothing", async () => {
    const person = await fixture.createUser("invited-wrong-password")
    await givePassword(person.id, PASSWORD)
    await recordSignInFrom(person.id, CHROME_ON_MAC)
    const token = await invite(orgA.id, person.email, alice.id)

    const { result, mails } = await mailedBy(async () => {
      browse()
      return signInAndAcceptInvitation(token, "not it")
    })

    expect(result).toEqual({ success: false, error: "Incorrect password" })
    expect(mails).toEqual([])
  })

  test("only the holder of a live session can ask about it", async () => {
    expect(await detectNewSignIn("no-such-session")).toBe("recognised")
  })
})

describe("membership notices", () => {
  test("someone added by an administrator is told, in that organization's colours", async () => {
    const person = await fixture.createUser("added")
    await actAs(alice)

    const { result, mails } = await mailedBy(() =>
      addMembers(orgA.id, [person.id], "member")
    )

    expect(result).toMatchObject({ success: true, added: 1 })
    const mail = only(mails, person.email)
    expect(mail.subject).toBe(`You were added to ${orgA.name}`)
    expect(mail.text).toContain(alice.name)
    expect(mail.html).toContain(TENANT_COLOR)
    expect(to(mails, alice.email)).toEqual([])
    expectNoSecrets(mail)
  })

  test("a refused addition sends nothing", async () => {
    const person = await fixture.createUser("not-added")

    // A plain member of A, and an owner of another tenant, may not add to A.
    for (const caller of [carol, bob]) {
      await actAs(caller)
      const { result, mails } = await mailedBy(() =>
        addMembers(orgA.id, [person.id], "member")
      )

      expect(result.success).toBe(false)
      expect(mails).toEqual([])
    }
  })

  test("a role change is reported to the member whose role changed", async () => {
    const person = await memberOf(orgA.id, "promoted")
    await actAs(alice)

    const { result, mails } = await mailedBy(() =>
      setMemberRole(orgA.id, person.id, "admin")
    )

    expect(result).toEqual({ success: true })
    const mail = only(mails, person.email)
    expect(mail.subject).toBe(`Your role in ${orgA.name} changed`)
    expect(mail.text).toContain("from a member to an admin")
    expect(mail.html).toContain(TENANT_COLOR)
  })

  test("a refused role change sends nothing", async () => {
    const person = await memberOf(orgA.id, "not-promoted")
    await actAs(bob)

    const { result, mails } = await mailedBy(() =>
      setMemberRole(orgA.id, person.id, "admin")
    )

    expect(result.success).toBe(false)
    expect(mails).toEqual([])
  })

  test("someone removed by an administrator is told", async () => {
    const person = await memberOf(orgA.id, "removed")
    await actAs(alice)

    const { result, mails } = await mailedBy(() =>
      removeMember(orgA.id, person.id)
    )

    expect(result).toEqual({ success: true })
    const mail = only(mails, person.email)
    expect(mail.subject).toBe(`You were removed from ${orgA.name}`)
    expect(mail.text).toContain(alice.name)
  })

  test("leaving an organization yourself sends nothing", async () => {
    const person = await memberOf(orgA.id, "leaver")
    await actAs(person)

    const { result, mails } = await mailedBy(() =>
      removeMember(orgA.id, person.id)
    )

    expect(result).toEqual({ success: true })
    expect(mails).toEqual([])
  })

  test("a removal from another tenant is refused and sends nothing", async () => {
    await actAs(bob)

    const { result, mails } = await mailedBy(() =>
      removeMember(orgA.id, carol.id)
    )

    expect(result.success).toBe(false)
    expect(mails).toEqual([])
  })
})

async function invite(
  organizationId: string,
  email: string,
  inviterId: string
) {
  const { token, tokenHash } = createInvitationToken()
  const now = new Date()
  await db.insert(invitation).values({
    id: crypto.randomUUID(),
    organizationId,
    email,
    role: "member",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: now,
    lastSentAt: now,
    inviterId,
    tokenHash,
  })

  return token
}

describe("invitation acceptance", () => {
  test("the inviter is told when their invitation is accepted", async () => {
    const person = await fixture.createUser("invitee")
    const token = await invite(orgA.id, person.email, alice.id)
    await actAs(person)

    const { result, mails } = await mailedBy(() => acceptInvitation(token))

    expect(result).toMatchObject({ success: true, slug: orgA.slug })
    const mail = only(mails, alice.email)
    expect(mail.subject).toBe(
      `${person.name} accepted your invitation to ${orgA.name}`
    )
    expect(mail.html).toContain(TENANT_COLOR)
    expect(to(mails, person.email)).toEqual([])
    expectNoSecrets(mail, [token])
  })

  test("an inviter who has since left is not told", async () => {
    const inviter = await memberOf(orgA.id, "former-inviter", "admin")
    const person = await fixture.createUser("orphan-invitee")
    const token = await invite(orgA.id, person.email, inviter.id)
    await db.delete(member).where(eq(member.userId, inviter.id))
    await actAs(person)

    const { result, mails } = await mailedBy(() => acceptInvitation(token))

    expect(result.success).toBe(true)
    expect(mails).toEqual([])
  })

  test("an invitation taken by another account sends nothing", async () => {
    const person = await fixture.createUser("intended")
    const token = await invite(orgA.id, person.email, alice.id)
    await actAs(bob)

    const { result, mails } = await mailedBy(() => acceptInvitation(token))

    expect(result.success).toBe(false)
    expect(mails).toEqual([])
  })

  test("joining an open organization settles an invitation and tells its sender", async () => {
    await db
      .update(organization)
      .set({ allowPublicSignUp: true })
      .where(eq(organization.id, orgB.id))
    try {
      const person = await fixture.createUser("joiner")
      await invite(orgB.id, person.email, bob.id)
      await actAs(person)

      const { result, mails } = await mailedBy(() =>
        joinOrganization(orgB.slug)
      )

      expect(result).toMatchObject({ success: true, slug: orgB.slug })
      expect(only(mails, bob.email).subject).toBe(
        `${person.name} accepted your invitation to ${orgB.name}`
      )
    } finally {
      await db
        .update(organization)
        .set({ allowPublicSignUp: false })
        .where(eq(organization.id, orgB.id))
    }
  })
})
