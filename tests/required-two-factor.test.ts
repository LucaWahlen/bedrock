import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq, inArray, like } from "drizzle-orm"

import { confirmTwoFactorEnrollment } from "@/features/account/actions/confirm-two-factor-enrollment"
import { finishPasskeyRegistration } from "@/features/account/actions/finish-passkey-registration"
import { startPasskeyRegistration } from "@/features/account/actions/start-passkey-registration"
import { startTwoFactorEnrollment } from "@/features/account/actions/start-two-factor-enrollment"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { login } from "@/features/auth/actions/login"
import {
  awaitsSecondFactor,
  heldMembershipIn,
  membershipIn,
} from "@/features/auth/utils/access"
import { getOrganizationAuthentication } from "@/features/organizations/actions/get-organization-authentication"
import { getOrganizationMembers } from "@/features/organizations/actions/get-organization-members"
import { updateOrganization } from "@/features/organizations/actions/update-organization"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  member,
  oauthClient,
  organization,
  verification,
} from "@/features/shared/lib/db/schema"
import {
  authorizationRefusal,
  resolveApplicationAccess,
} from "@/features/shared/lib/oidc-claims"
import { createSoftwarePasskey } from "@/tests/support/authenticator"
import { givePassword, totpFor } from "@/tests/support/credentials"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import { actAs, browse, forgetSessions } from "@/tests/support/request"

// An organization that requires a second factor, driven through the real
// actions: who may switch it on, what its members are then refused, and how
// enrolling either factor lets them back in. Two tenants throughout, so every
// rule is also proven not to reach across them.

const PASSWORD = "correct horse battery staple"
const fixture = await createFixture("required-2fa")
const { orgA, orgB, alice, bob, carol } = fixture
const clientA = `test-required-2fa-${fixture.suffix}-app-a`
const clientB = `test-required-2fa-${fixture.suffix}-app-b`

let dave: FixtureUser
let erin: FixtureUser

async function addMember(organizationId: string, userId: string, role: string) {
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  })
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
}

async function requirement(organizationId: string) {
  const [row] = await db
    .select({ requireTwoFactor: organization.requireTwoFactor })
    .from(organization)
    .where(eq(organization.id, organizationId))

  return row.requireTwoFactor
}

beforeAll(async () => {
  // An administrator of A who is not an owner, and a plain member of A who
  // will enrol with a passkey.
  dave = await fixture.createUser("dave")
  erin = await fixture.createUser("erin")
  await addMember(orgA.id, dave.id, "admin")
  await addMember(orgA.id, erin.id, "member")

  for (const person of [alice, bob, carol, dave, erin]) {
    await givePassword(person.id, PASSWORD)
  }

  const now = new Date()
  await db.insert(oauthClient).values([
    {
      id: clientA,
      clientId: clientA,
      redirectUris: ["https://a.example.test/callback"],
      referenceId: orgA.id,
      createdAt: now,
    },
    {
      id: clientB,
      clientId: clientB,
      redirectUris: ["https://b.example.test/callback"],
      referenceId: orgB.id,
      createdAt: now,
    },
  ])
})

afterAll(async () => {
  await db
    .delete(oauthClient)
    .where(inArray(oauthClient.clientId, [clientA, clientB]))
  await db
    .delete(verification)
    .where(like(verification.value, `test-required-2fa-${fixture.suffix}-%`))
  await fixture.cleanup()
})

describe("switching the requirement", () => {
  test("a plain member cannot", async () => {
    await actAs(carol)

    expect(
      await updateOrganization({
        organizationId: orgA.id,
        requireTwoFactor: true,
      })
    ).toMatchObject({ success: false })
    expect(await requirement(orgA.id)).toBe(false)
  })

  test("an administrator who is not an owner cannot", async () => {
    await actAs(dave)

    expect(
      await updateOrganization({
        organizationId: orgA.id,
        requireTwoFactor: true,
      })
    ).toEqual({
      success: false,
      error: "Only owners can change whether a second factor is required",
    })
    expect(await requirement(orgA.id)).toBe(false)
  })

  test("an owner of another organization cannot", async () => {
    await actAs(bob)

    expect(
      await updateOrganization({
        organizationId: orgA.id,
        requireTwoFactor: true,
      })
    ).toMatchObject({ success: false })
    expect(await requirement(orgA.id)).toBe(false)
  })

  test("an owner without a second factor of their own cannot", async () => {
    await actAs(alice)

    expect(
      await updateOrganization({
        organizationId: orgA.id,
        requireTwoFactor: true,
      })
    ).toEqual({
      success: false,
      error:
        "Set up two-factor authentication or a passkey on your own account first",
    })
    expect(await requirement(orgA.id)).toBe(false)
  })

  test("an owner with one can, and it is audited", async () => {
    await registerPasskey(alice)
    await actAs(alice)

    expect(
      await updateOrganization({
        organizationId: orgA.id,
        requireTwoFactor: true,
      })
    ).toEqual({ success: true, slug: orgA.slug })
    expect(await requirement(orgA.id)).toBe(true)
    // Only the organization asked about.
    expect(await requirement(orgB.id)).toBe(false)

    const [event] = await db
      .select({ metadata: auditEvent.metadata, outcome: auditEvent.outcome })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "organization.updated"),
          eq(auditEvent.organizationId, orgA.id),
          eq(auditEvent.actorUserId, alice.id),
          eq(auditEvent.outcome, "success")
        )
      )
    expect(event.metadata).toEqual({
      changed: ["requireTwoFactor"],
      requireTwoFactor: { from: false, to: true },
    })
  })

  test("owning A does not let its owner change B", async () => {
    await actAs(alice)

    expect(
      await updateOrganization({
        organizationId: orgB.id,
        requireTwoFactor: true,
      })
    ).toMatchObject({ success: false })
    expect(await requirement(orgB.id)).toBe(false)
  })
})

describe("the compliance summary", () => {
  test("lists each member's factors for the organization's administrators", async () => {
    await actAs(alice)
    const summary = await getOrganizationAuthentication(orgA.id)

    expect(summary.requireTwoFactor).toBe(true)
    expect(summary.capabilities.canRequireTwoFactor).toBe(true)
    expect(summary.viewerHasSecondFactor).toBe(true)
    expect(summary.members.map((person) => person.userId).toSorted()).toEqual(
      [alice.id, carol.id, dave.id, erin.id].toSorted()
    )
    expect(
      summary.members.find((person) => person.userId === alice.id)
    ).toMatchObject({ totp: false, passkeys: 1 })
    expect(
      summary.members.find((person) => person.userId === carol.id)
    ).toMatchObject({ totp: false, passkeys: 0 })
    // Carol, Dave and Erin.
    expect(summary.nonCompliantCount).toBe(3)
  })

  test("is refused to an administrator of another organization", async () => {
    await actAs(bob)
    await expect(getOrganizationAuthentication(orgA.id)).rejects.toThrow()

    await actAs(alice)
    await expect(getOrganizationAuthentication(orgB.id)).rejects.toThrow()
  })

  // Dave administers A, but holds no second factor now that A requires one.
  test("is refused to an administrator who owes a second factor", async () => {
    await actAs(dave)
    await expect(getOrganizationAuthentication(orgA.id)).rejects.toThrow()
  })

  // Running the instance is not membership of a tenant.
  test("is refused to a root owner who is not a member", async () => {
    await actAs(fixture.rootOwner)
    await expect(getOrganizationAuthentication(orgA.id)).rejects.toThrow()
  })

  test("the members table shows it to administrators only", async () => {
    await actAs(alice)
    const forOwner = await getOrganizationMembers({ organizationId: orgA.id })
    expect(forOwner.capabilities.canViewSecondFactors).toBe(true)
    const aliceRow = forOwner.members.find((row) => row.userId === alice.id)
    expect(aliceRow?.pending).toBeNull()
    expect(aliceRow && !aliceRow.pending && aliceRow.secondFactor).toEqual({
      totp: false,
      passkeys: 1,
    })

    // A plain member of B, which requires nothing, sees no one's factors.
    const fay = await fixture.createUser("fay")
    await addMember(orgB.id, fay.id, "member")
    await actAs(fay)
    const forMember = await getOrganizationMembers({ organizationId: orgB.id })
    expect(forMember.capabilities.canViewSecondFactors).toBe(false)
    for (const row of forMember.members) {
      if (!row.pending) expect(row.secondFactor).toBeNull()
    }
  })
})

describe("a member without a second factor", () => {
  test("holds the membership but it grants nothing", async () => {
    await actAs(carol)
    const access = await getAccessContext()
    const held = heldMembershipIn(access, orgA.id)

    expect(held).not.toBeNull()
    expect(held && awaitsSecondFactor(access, held)).toBe(true)
    expect(membershipIn(access, orgA.id)).toBeNull()
    await expect(
      getOrganizationMembers({ organizationId: orgA.id })
    ).rejects.toThrow()
  })

  test("is refused a code and a token for the organization's applications", async () => {
    expect(await authorizationRefusal(carol.id, clientA)).toEqual({
      reason: "second_factor_required",
      organizationSlug: orgA.slug,
    })
    await expect(resolveApplicationAccess(carol.id, clientA)).rejects.toThrow(
      "The organization owning this application requires a second factor"
    )
  })

  test("is not refused by an organization that requires nothing", async () => {
    await addMember(orgB.id, carol.id, "member")

    expect(await authorizationRefusal(carol.id, clientB)).toBeNull()
    expect(
      (await resolveApplicationAccess(carol.id, clientB)).organizationId
    ).toBe(orgB.id)
  })

  test("may still sign in, so they can enrol one", async () => {
    browse()

    expect(
      await login({ email: carol.email, password: PASSWORD }, orgA.slug)
    ).toEqual({ success: true, next: "organization" })
    const access = await getAccessContext()
    expect(access.user?.id).toBe(carol.id)
    expect(heldMembershipIn(access, orgA.id)).not.toBeNull()
    expect(membershipIn(access, orgA.id)).toBeNull()
  })

  test("is let in once they turn on an authenticator app", async () => {
    await enrolTotp(carol)

    expect(await authorizationRefusal(carol.id, clientA)).toBeNull()
    expect(
      (await resolveApplicationAccess(carol.id, clientA)).organizationSlug
    ).toBe(orgA.slug)

    await actAs(carol)
    expect(membershipIn(await getAccessContext(), orgA.id)).not.toBeNull()
  })

  test("is let in once they add a passkey", async () => {
    expect(await authorizationRefusal(erin.id, clientA)).toMatchObject({
      reason: "second_factor_required",
    })

    await registerPasskey(erin)

    expect(await authorizationRefusal(erin.id, clientA)).toBeNull()
    await actAs(erin)
    expect(membershipIn(await getAccessContext(), orgA.id)).not.toBeNull()
  })

  test("is let in everywhere again once an owner lifts the requirement", async () => {
    await actAs(alice)
    expect(
      await updateOrganization({
        organizationId: orgA.id,
        requireTwoFactor: false,
      })
    ).toEqual({ success: true, slug: orgA.slug })

    expect(await authorizationRefusal(dave.id, clientA)).toBeNull()
  })
})
