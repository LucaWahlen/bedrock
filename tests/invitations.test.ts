import { afterAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { claimInvitation } from "@/features/organizations/lib/claim-invitation"
import {
  createInvitationToken,
  hashInvitationToken,
} from "@/features/organizations/lib/invitations"
import {
  hasPendingInvitationFor,
  resolveInvitationByToken,
  resolvePendingInvitationFor,
} from "@/features/organizations/lib/resolve-invitation"
import { settleInvitationsFor } from "@/features/organizations/lib/settle-invitations"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  member,
  organization,
  user,
} from "@/features/shared/lib/db/schema"
import { housekeepInvitations } from "@/scripts/housekeeping/invitations"
import { createFixture } from "@/tests/support/fixtures"

// Runs against the development database from `compose.yaml`, and removes every
// row it creates. What is proven here is the layer underneath the actions: the
// constraints that hold regardless of which caller reaches them, and the single
// reading of a token that every acceptance path shares.

const fixture = await createFixture("invitations")
const { suffix } = fixture
const organizationId = fixture.orgA.id
const inviterId = fixture.alice.id
const now = new Date()

const NEW_INVITEE = `new-${suffix}@example.test`
const EXISTING_MEMBER = fixture.carol.email

function pendingInvitation(email: string, tokenHash: string) {
  return {
    id: crypto.randomUUID(),
    organizationId,
    email,
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: now,
    lastSentAt: now,
    inviterId,
    tokenHash,
  }
}

async function insertInvitation(
  email: string,
  overrides: Partial<typeof invitation.$inferInsert> = {}
) {
  const { token, tokenHash } = createInvitationToken()
  await db
    .insert(invitation)
    .values({ ...pendingInvitation(email, tokenHash), ...overrides })

  return { token, tokenHash }
}

async function createClaimant(label: string) {
  return fixture.createUser(`claimant-${label}`, { emailVerified: false })
}

// A Drizzle query builder is a thenable, not a promise, so `.rejects` has to be
// given a real one or the assertion passes on the builder itself.
async function expectRejection(run: () => PromiseLike<unknown>) {
  await expect((async () => run())()).rejects.toThrow()
}

afterAll(() => fixture.cleanup())

describe("invitation tokens", () => {
  test("only the digest is persisted", () => {
    const { token, tokenHash } = createInvitationToken()

    expect(tokenHash).not.toBe(token)
    expect(hashInvitationToken(token)).toBe(tokenHash)
  })

  test("every token is distinct", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createInvitationToken().token)
    )

    expect(tokens.size).toBe(50)
  })
})

describe("database invariants", () => {
  test("the root organization cannot open public sign-up", async () => {
    await expectRejection(() =>
      db
        .update(organization)
        .set({ allowPublicSignUp: true })
        .where(eq(organization.isRoot, true))
    )
  })

  test("an address has at most one invitation per organization", async () => {
    await insertInvitation(NEW_INVITEE)

    await expectRejection(() => insertInvitation(NEW_INVITEE))
  })

  test("a token digest cannot be reused", async () => {
    const { tokenHash } = await insertInvitation(`dup-${suffix}@example.test`)

    await expectRejection(() =>
      db
        .insert(invitation)
        .values(pendingInvitation(`other-${suffix}@example.test`, tokenHash))
    )
  })
})

describe("resolving a token", () => {
  test("a live token resolves to its organization and role", async () => {
    const { token } = await insertInvitation(`live-${suffix}@example.test`)
    const resolution = await resolveInvitationByToken(token)

    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return

    expect(resolution.invitation.organization.id).toBe(organizationId)
    expect(resolution.invitation.role).toBe("admin")
    expect(resolution.invitation.recipientUserId).toBeNull()
  })

  test.each([
    ["an unknown token", "definitely-not-a-token"],
    ["an empty token", ""],
  ])("%s is refused", async (_name, token) => {
    expect(await resolveInvitationByToken(token)).toEqual({
      ok: false,
      refusal: "unknown",
    })
  })

  // Withdrawing and accepting both delete the row, so a stale token is not
  // distinguishable from one that never existed. That is the whole disclosure a
  // stranger holding an old link is owed.
  test("a settled invitation is indistinguishable from an unknown one", async () => {
    const { token, tokenHash } = await insertInvitation(
      `settled-${suffix}@example.test`
    )
    await db.delete(invitation).where(eq(invitation.tokenHash, tokenHash))

    expect(await resolveInvitationByToken(token)).toEqual({
      ok: false,
      refusal: "unknown",
    })
  })

  test("a lapsed invitation is refused before housekeeping removes it", async () => {
    const { token } = await insertInvitation(`expired-${suffix}@example.test`, {
      expiresAt: new Date(Date.now() - 60_000),
    })

    expect(await resolveInvitationByToken(token)).toEqual({
      ok: false,
      refusal: "expired",
    })
  })

  test("someone who already belongs cannot be walked in again", async () => {
    const { token } = await insertInvitation(EXISTING_MEMBER)

    expect(await resolveInvitationByToken(token)).toEqual({
      ok: false,
      refusal: "already_member",
    })
  })

  test("an organization closed after sending refuses its own invitation", async () => {
    const { token } = await insertInvitation(`closed-${suffix}@example.test`)

    for (const status of ["suspended", "deleted"] as const) {
      await db
        .update(organization)
        .set({
          status,
          deletedAt: status === "deleted" ? new Date() : null,
        })
        .where(eq(organization.id, organizationId))

      expect(await resolveInvitationByToken(token)).toEqual({
        ok: false,
        refusal: "organization_unavailable",
      })
    }

    await db
      .update(organization)
      .set({ status: "active", deletedAt: null })
      .where(eq(organization.id, organizationId))

    expect((await resolveInvitationByToken(token)).ok).toBe(true)
  })
})

// A signed-in visitor never has the token: only its digest is stored, so the
// link cannot be rebuilt for someone who arrived by signing in. Finding the
// invitation by the address on their session is what stops the login page being
// a dead end for the very person the invitation was for.
describe("finding an invitation without the token", () => {
  const invited = `session-invitee-${suffix}@example.test`

  test("finds what was offered to that address here", async () => {
    await insertInvitation(invited)

    expect(await hasPendingInvitationFor(invited, organizationId)).toBe(true)

    const resolution = await resolvePendingInvitationFor(
      invited,
      organizationId
    )

    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.invitation.email).toBe(invited)
    expect(resolution.invitation.role).toBe("admin")
  })

  test("matches the address whatever case it is written in", async () => {
    expect(
      await hasPendingInvitationFor(invited.toUpperCase(), organizationId)
    ).toBe(true)
  })

  test("finds nothing for an address that was not invited", async () => {
    expect(
      await hasPendingInvitationFor(
        `nobody-${suffix}@example.test`,
        organizationId
      )
    ).toBe(false)
  })

  test("does not reach into another organization's invitations", async () => {
    expect(await hasPendingInvitationFor(invited, "some-other-org")).toBe(false)
  })

  test("ignores one that has lapsed", async () => {
    const lapsed = `lapsed-session-${suffix}@example.test`
    await insertInvitation(lapsed, { expiresAt: new Date(Date.now() - 60_000) })

    expect(await hasPendingInvitationFor(lapsed, organizationId)).toBe(false)
    expect(await resolvePendingInvitationFor(lapsed, organizationId)).toEqual({
      ok: false,
      refusal: "unknown",
    })
  })

  test("ignores one that was withdrawn", async () => {
    const revoked = `revoked-session-${suffix}@example.test`
    const { tokenHash } = await insertInvitation(revoked)
    await db.delete(invitation).where(eq(invitation.tokenHash, tokenHash))

    expect(await hasPendingInvitationFor(revoked, organizationId)).toBe(false)
  })

  // The same judgement as the token path, so neither can admit someone the
  // other would turn away.
  test("refuses a suspended organization exactly as the token path does", async () => {
    const address = `closed-session-${suffix}@example.test`
    await insertInvitation(address)

    await db
      .update(organization)
      .set({ status: "suspended" })
      .where(eq(organization.id, organizationId))

    expect(await resolvePendingInvitationFor(address, organizationId)).toEqual({
      ok: false,
      refusal: "organization_unavailable",
    })

    await db
      .update(organization)
      .set({ status: "active" })
      .where(eq(organization.id, organizationId))
  })
})

// Someone who already has an account but no membership is the case that used to
// strand people: the page offered "accept", the action wanted a session, and the
// login page refused them for not being a member of the organization they were
// being invited to. All three ways in now settle on the same claim.
async function resolvedInvitation(email: string) {
  const { token } = await insertInvitation(email)
  const resolution = await resolveInvitationByToken(token)

  if (!resolution.ok)
    throw new Error(`unexpected refusal: ${resolution.refusal}`)

  return resolution.invitation
}

describe("claiming an invitation", () => {
  test("grants exactly the membership the invitation named", async () => {
    const claimant = await createClaimant("grant")
    const invited = await resolvedInvitation(claimant.email)

    expect(await claimInvitation({ invited, claimant, via: "sign-in" })).toBe(
      true
    )

    const memberships = await db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, claimant.id))

    expect(memberships).toEqual([{ organizationId, role: "admin" }])
  })

  test("confirms the address, because the token already proved it", async () => {
    const claimant = await createClaimant("verification")
    const invited = await resolvedInvitation(claimant.email)
    await claimInvitation({ invited, claimant, via: "sign-in" })

    const [claimed] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, claimant.id))

    expect(claimed.emailVerified).toBe(true)
  })

  test("spends the invitation, so the link cannot be used twice", async () => {
    const claimant = await createClaimant("replay")
    const { token } = await insertInvitation(claimant.email)
    const resolution = await resolveInvitationByToken(token)
    if (!resolution.ok) throw new Error("fixture did not resolve")

    const first = await claimInvitation({
      invited: resolution.invitation,
      claimant,
      via: "sign-in",
    })
    const second = await claimInvitation({
      invited: resolution.invitation,
      claimant,
      via: "sign-in",
    })

    expect([first, second]).toEqual([true, false])
    expect(await resolveInvitationByToken(token)).toEqual({
      ok: false,
      refusal: "unknown",
    })
  })

  test("a rotated token cannot finish a claim it resolved earlier", async () => {
    const claimant = await createClaimant("rotated")
    const invited = await resolvedInvitation(claimant.email)
    const replacement = createInvitationToken()

    await db
      .update(invitation)
      .set({ tokenHash: replacement.tokenHash })
      .where(eq(invitation.id, invited.id))

    expect(await claimInvitation({ invited, claimant, via: "sign-in" })).toBe(
      false
    )
  })

  test("an invitation that expires after resolution cannot be claimed", async () => {
    const claimant = await createClaimant("expired-claim")
    const invited = await resolvedInvitation(claimant.email)

    await db
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(invitation.id, invited.id))

    expect(await claimInvitation({ invited, claimant, via: "sign-in" })).toBe(
      false
    )
  })

  test("an organization suspended after resolution cannot be joined", async () => {
    const claimant = await createClaimant("suspended-claim")
    const invited = await resolvedInvitation(claimant.email)

    await db
      .update(organization)
      .set({ status: "suspended" })
      .where(eq(organization.id, organizationId))
    const claimed = await claimInvitation({ invited, claimant, via: "sign-in" })
    await db
      .update(organization)
      .set({ status: "active" })
      .where(eq(organization.id, organizationId))

    expect(claimed).toBe(false)
  })

  test("a concurrent membership settles the invitation without changing its role", async () => {
    const claimant = await createClaimant("membership-race")
    const invited = await resolvedInvitation(claimant.email)

    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: claimant.id,
      role: "member",
      createdAt: now,
    })

    expect(await claimInvitation({ invited, claimant, via: "sign-in" })).toBe(
      true
    )

    const [membership] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, claimant.id)
        )
      )
    const acceptedEvents = await db
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "organization.invitation_accepted"),
          eq(auditEvent.targetId, claimant.id)
        )
      )

    expect(membership.role).toBe("member")
    expect(acceptedEvents).toBeEmpty()
    expect(
      await db
        .select({ id: invitation.id })
        .from(invitation)
        .where(eq(invitation.id, invited.id))
    ).toBeEmpty()
  })
})

describe("settling invitations", () => {
  test("direct membership removes an open invitation for the same address", async () => {
    const address = `direct-add-${suffix}@example.test`
    const { token } = await insertInvitation(address)

    await settleInvitationsFor(db, organizationId, [address.toUpperCase()])

    expect(await resolveInvitationByToken(token)).toEqual({
      ok: false,
      refusal: "unknown",
    })
  })
})

describe("housekeeping", () => {
  test("removes what has lapsed and leaves what has not", async () => {
    const lapsed = await insertInvitation(`lapsed-${suffix}@example.test`, {
      expiresAt: new Date(Date.now() - 60_000),
    })
    const live = await insertInvitation(`kept-${suffix}@example.test`)

    await housekeepInvitations()

    expect(
      await db
        .select({ id: invitation.id })
        .from(invitation)
        .where(eq(invitation.tokenHash, lapsed.tokenHash))
    ).toBeEmpty()
    expect(
      await db
        .select({ id: invitation.id })
        .from(invitation)
        .where(eq(invitation.tokenHash, live.tokenHash))
    ).toHaveLength(1)
  })

  test("clearing a lapsed invitation frees the address to be invited again", async () => {
    const address = `retry-${suffix}@example.test`
    await insertInvitation(address, {
      expiresAt: new Date(Date.now() - 60_000),
    })

    await housekeepInvitations()

    await expect(insertInvitation(address)).resolves.toBeDefined()
  })
})
