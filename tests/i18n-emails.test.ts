import { afterAll, beforeEach, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"

import { sendResetPasswordMail } from "@/features/auth/lib/auth-emails"
import {
  sendAccountDisabledNotice,
  sendMemberRoleChangedNotice,
} from "@/features/notifications"
import { inviteMember } from "@/features/organizations/actions/invite-member"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import type { EmailMessage } from "@/features/shared/lib/email/types"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import { outbox } from "@/tests/support/mail"
import { actAs, browse, setRequestHeader } from "@/tests/support/request"

// Every mail is written in its recipient's language, whatever the language of
// the request that sends it. An address with no account yet gets the sender's.

const fixture = await createFixture("i18n-emails")
const { orgA, orgB, alice, bob, carol } = fixture

afterAll(() => fixture.cleanup())

async function speaks(person: FixtureUser, locale: string | null) {
  await db.update(user).set({ locale }).where(eq(user.id, person.id))
}

beforeEach(async () => {
  await Promise.all([alice, bob, carol].map((person) => speaks(person, null)))
})

async function mailed(run: () => Promise<unknown>, address: string) {
  const start = outbox.length
  await run()
  const sent = outbox.slice(start).filter((mail) => mail.to.address === address)
  expect(sent).toHaveLength(1)

  return sent[0] as EmailMessage
}

function content(mail: EmailMessage) {
  return `${mail.subject}\n${mail.text}\n${mail.html}`
}

describe("an account notice", () => {
  test("is German for someone who chose German, sent from an English request", async () => {
    await speaks(carol, "de")
    browse()
    setRequestHeader("accept-language", "en")

    const mail = await mailed(
      () =>
        sendAccountDisabledNotice({
          recipient: { name: carol.name, email: carol.email },
          at: new Date("2026-03-04T05:06:00Z"),
          reason: "Left the company",
        }),
      carol.email
    )

    expect(mail.subject).toBe("Dein Konto wurde deaktiviert")
    expect(mail.text).toContain(`Hallo ${carol.name}`)
    expect(mail.text).toContain("Zeitpunkt")
    expect(mail.text).toContain("04.03.2026, 05:06 UTC")
    expect(mail.text).toContain("Falls du das für einen Fehler hältst")
    // The administrator's own words are shown as written.
    expect(mail.text).toContain("Left the company")
    expect(mail.html).toContain('lang="de"')
    expect(content(mail)).not.toContain("Your account")
  })

  test("is English for someone who chose English, sent from a German request", async () => {
    await speaks(carol, "en")
    browse()
    setRequestHeader("accept-language", "de")

    const mail = await mailed(
      () =>
        sendAccountDisabledNotice({
          recipient: { name: carol.name, email: carol.email },
          at: new Date("2026-03-04T05:06:00Z"),
        }),
      carol.email
    )

    expect(mail.subject).toBe("Your account was disabled")
    expect(mail.text).toContain(`Hi ${carol.name}`)
    expect(mail.text).toMatch(/Mar 4, 2026(,| at) 5:06\sAM UTC/)
    expect(mail.html).toContain('lang="en"')
    expect(content(mail)).not.toContain("Konto")
  })
})

describe("a membership notice", () => {
  test("follows the recipient's language, not the actor's", async () => {
    await speaks(alice, "en")
    await speaks(carol, "de")
    await actAs(alice)

    const organization = { ...orgA, logo: null, color: null }
    const german = await mailed(
      () =>
        sendMemberRoleChangedNotice({
          recipient: { name: carol.name, email: carol.email },
          organization,
          actorName: alice.name,
          from: ["member"],
          to: "admin",
        }),
      carol.email
    )

    expect(german.subject).toBe(`Deine Rolle in ${orgA.name} wurde geändert`)
    expect(german.text).toContain("von Mitglied auf Admin")
    expect(german.text).toContain("Organisation")

    await speaks(alice, "de")
    await speaks(carol, "en")
    await actAs(alice)

    const english = await mailed(
      () =>
        sendMemberRoleChangedNotice({
          recipient: { name: carol.name, email: carol.email },
          organization,
          actorName: alice.name,
          from: ["member"],
          to: "admin",
        }),
      carol.email
    )

    expect(english.subject).toBe(`Your role in ${orgA.name} changed`)
    expect(english.text).toContain("from a member to an admin")
  })
})

describe("an invitation", () => {
  test("to an unknown address is written in the inviter's language", async () => {
    await speaks(alice, "de")
    await actAs(alice)
    setRequestHeader("accept-language", "en")
    const email = `unknown-de-${crypto.randomUUID()}@example.com`

    const mail = await mailed(
      () => inviteMember({ organizationId: orgA.id, email, role: "member" }),
      email
    )

    expect(mail.subject).toBe(
      `${alice.name} hat dich zu ${orgA.name} eingeladen`
    )
    expect(mail.text).toContain("als Mitglied beizutreten")
    expect(mail.text).toContain("Einladung annehmen")
  })

  test("to an unknown address from an English inviter is English", async () => {
    await speaks(bob, "en")
    await actAs(bob)
    setRequestHeader("accept-language", "de")
    const email = `unknown-en-${crypto.randomUUID()}@example.com`

    const mail = await mailed(
      () => inviteMember({ organizationId: orgB.id, email, role: "admin" }),
      email
    )

    expect(mail.subject).toBe(`${bob.name} invited you to ${orgB.name}`)
    expect(mail.text).toContain("as an admin")
    expect(mail.text).toContain("Accept invitation")
  })

  test("to an existing account is written in that account's language", async () => {
    await speaks(alice, "de")
    await speaks(bob, "en")
    await actAs(alice)

    const mail = await mailed(
      () =>
        inviteMember({
          organizationId: orgA.id,
          email: bob.email,
          role: "member",
        }),
      bob.email
    )

    expect(mail.subject).toBe(`${alice.name} invited you to ${orgA.name}`)
    expect(content(mail)).not.toContain("eingeladen")
  })
})

describe("a password reset", () => {
  test("is written in the account's language", async () => {
    browse()
    const mail = await mailed(
      () =>
        sendResetPasswordMail({
          user: { name: carol.name, email: carol.email, locale: "de" },
          url: "https://example.com/reset-password/token",
          token: "token",
        }),
      carol.email
    )

    expect(mail.subject).toStartWith("Setze dein Passwort für")
    expect(mail.text).toContain("Neues Passwort wählen")
  })
})
