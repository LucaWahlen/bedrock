import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq, like } from "drizzle-orm"
import { createFormatter } from "next-intl"

import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { deletePasskey } from "@/features/account/actions/delete-passkey"
import { disableTwoFactor } from "@/features/account/actions/disable-two-factor"
import { finishPasskeyRegistration } from "@/features/account/actions/finish-passkey-registration"
import { getSecurityOverview } from "@/features/account/actions/get-security-overview"
import { startPasskeyRegistration } from "@/features/account/actions/start-passkey-registration"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import type { SecondFactorStanding } from "@/features/account/types"
import {
  authenticatorRemovalRefusal as authenticatorRefusal,
  passkeyRemovalRefusal as passkeyRefusal,
} from "@/features/account/utils/second-factor-requirement"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  member,
  organization,
  passkey,
  user,
  verification,
} from "@/features/shared/lib/db/schema"
import { translatorFor } from "@/features/shared/lib/i18n/translator"
import { createSoftwarePasskey } from "@/tests/support/authenticator"
import { givePassword, totpFor } from "@/tests/support/credentials"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import { actAs, forgetSessions } from "@/tests/support/request"

// Giving up the last second factor while an organization requires one is
// refused by the actions themselves, not only hidden in the Security section.
// A requires a second factor, B does not, so the same move is proven allowed
// for a member of B only.

const PASSWORD = "correct horse battery staple"
const fixture = await createFixture("factor-removal")
const { orgA, orgB } = fixture

async function memberOf(organizationId: string, label: string) {
  const person = await fixture.createUser(label)
  await givePassword(person.id, PASSWORD)
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId: person.id,
    role: "member",
    createdAt: new Date(),
  })

  return person
}

async function enrolTotp(person: FixtureUser) {
  await actAs(person)
  const started = await startTwoFactorEnrollment({ currentPassword: PASSWORD })
  if (!started.success) throw new Error(started.error)
  const confirmed = await confirmTwoFactorEnrollment({
    code: await totpFor(started.data.secret),
  })
  if (!confirmed.success) throw new Error(confirmed.error)
  // Enabling replaced the session the harness had cached for them.
  forgetSessions([person.id])

  return started.data.secret
}

async function registerPasskey(person: FixtureUser) {
  await actAs(person, { keepCookies: true })
  const options = await startPasskeyRegistration({ currentPassword: PASSWORD })
  if (!options.success) throw new Error(options.error)
  const key = await createSoftwarePasskey()
  const result = await finishPasskeyRegistration(
    "Test key",
    key.register(options.data)
  )
  if (!result.success) throw new Error(result.error)
}

async function passkeyIdsOf(userId: string) {
  const rows = await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, userId))

  return rows.map((row) => row.id)
}

async function twoFactorEnabled(userId: string) {
  const [row] = await db
    .select({ enabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, userId))

  return row.enabled
}

const requiredMessage = `${orgA.name} requires two-factor authentication`

beforeAll(async () => {
  await db
    .update(organization)
    .set({ requireTwoFactor: true })
    .where(eq(organization.id, orgA.id))
})

afterAll(async () => {
  await db
    .delete(verification)
    .where(like(verification.value, `test-factor-removal-${fixture.suffix}-%`))
  await fixture.cleanup()
})

const english = translatorFor("en", "account")
const englishFormat = createFormatter({ locale: "en" })

function authenticatorRemovalRefusal(standing: SecondFactorStanding) {
  return authenticatorRefusal(standing, english, englishFormat)
}

function passkeyRemovalRefusal(standing: SecondFactorStanding) {
  return passkeyRefusal(standing, english, englishFormat)
}

describe("the refusal", () => {
  test("names every organization that requires a second factor", () => {
    expect(
      authenticatorRemovalRefusal({
        twoFactorEnabled: true,
        passkeyCount: 0,
        requiredBy: ["Acme", "Globex"],
      })
    ).toBe(
      "Acme and Globex require two-factor authentication; add a passkey or keep your authenticator app"
    )
  })

  test("is not made while another factor remains or nothing is required", () => {
    const standing = { twoFactorEnabled: true, passkeyCount: 1 }
    expect(
      authenticatorRemovalRefusal({ ...standing, requiredBy: ["Acme"] })
    ).toBeNull()
    expect(passkeyRemovalRefusal({ ...standing, requiredBy: ["Acme"] })).toBe(
      null
    )
    expect(
      passkeyRemovalRefusal({
        twoFactorEnabled: false,
        passkeyCount: 1,
        requiredBy: [],
      })
    ).toBeNull()
    expect(
      passkeyRemovalRefusal({
        twoFactorEnabled: false,
        passkeyCount: 2,
        requiredBy: ["Acme"],
      })
    ).toBeNull()
  })
})

describe("turning off the authenticator app", () => {
  test("is refused when it is the only factor an organization requires", async () => {
    const person = await memberOf(orgA.id, "totp-a")
    const secret = await enrolTotp(person)
    await actAs(person)

    const overview = await getSecurityOverview()
    expect(overview).toMatchObject({
      success: true,
      data: { twoFactorRequiredBy: [orgA.name] },
    })

    const result = await disableTwoFactor({
      currentPassword: PASSWORD,
      code: await totpFor(secret),
    })
    expect(result).toEqual({
      success: false,
      error: `${requiredMessage}; add a passkey or keep your authenticator app`,
    })
    expect(await twoFactorEnabled(person.id)).toBe(true)

    const [denied] = await db
      .select({ outcome: auditEvent.outcome, reason: auditEvent.reason })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "account.two_factor_disabled"),
          eq(auditEvent.actorUserId, person.id)
        )
      )
    expect(denied).toEqual({
      outcome: "denied",
      reason: "Required by an organization",
    })
  })

  test("is allowed for a member of an organization that requires nothing", async () => {
    const person = await memberOf(orgB.id, "totp-b")
    const secret = await enrolTotp(person)
    await actAs(person)

    expect(
      await disableTwoFactor({
        currentPassword: PASSWORD,
        code: await totpFor(secret),
      })
    ).toEqual({ success: true })
    expect(await twoFactorEnabled(person.id)).toBe(false)
  })

  test("is allowed while a passkey remains", async () => {
    const person = await memberOf(orgA.id, "totp-and-key")
    const secret = await enrolTotp(person)
    await registerPasskey(person)
    await actAs(person)

    expect(
      await disableTwoFactor({
        currentPassword: PASSWORD,
        code: await totpFor(secret),
      })
    ).toEqual({ success: true })
  })
})

describe("removing a passkey", () => {
  test("is refused when it is the only factor an organization requires", async () => {
    const person = await memberOf(orgA.id, "key-a")
    await registerPasskey(person)
    const [id] = await passkeyIdsOf(person.id)
    await actAs(person)

    expect(await deletePasskey(id)).toEqual({
      success: false,
      error: `${requiredMessage}; add another passkey or an authenticator app before removing this one`,
    })
    expect(await passkeyIdsOf(person.id)).toEqual([id])
  })

  test("is allowed for a member of an organization that requires nothing", async () => {
    const person = await memberOf(orgB.id, "key-b")
    await registerPasskey(person)
    const [id] = await passkeyIdsOf(person.id)
    await actAs(person)

    expect(await deletePasskey(id)).toEqual({ success: true })
    expect(await passkeyIdsOf(person.id)).toEqual([])
  })

  test("is allowed while the authenticator app is on, but not the last factor after", async () => {
    const person = await memberOf(orgA.id, "key-and-totp")
    const secret = await enrolTotp(person)
    await registerPasskey(person)
    const [id] = await passkeyIdsOf(person.id)
    await actAs(person)

    expect(await deletePasskey(id)).toEqual({ success: true })
    expect(
      await disableTwoFactor({
        currentPassword: PASSWORD,
        code: await totpFor(secret),
      })
    ).toMatchObject({
      success: false,
      error: expect.stringContaining(orgA.name),
    })
  })
})
