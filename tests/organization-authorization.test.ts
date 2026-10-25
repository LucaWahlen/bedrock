import { afterAll, beforeEach, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { listAuditEvents } from "@/features/audit/actions/list-audit-events"
import { createOrganization } from "@/features/organizations/actions/create-organization"
import { deleteOrganization } from "@/features/organizations/actions/delete-organization"
import { getOrganizationMembers } from "@/features/organizations/actions/get-organization-members"
import { inviteMember } from "@/features/organizations/actions/invite-member"
import { removeMember } from "@/features/organizations/actions/remove-member"
import { restoreOrganization } from "@/features/organizations/actions/restore-organization"
import { revokeInvitation } from "@/features/organizations/actions/revoke-invitation"
import { setMemberRole } from "@/features/organizations/actions/set-member-role"
import { setOrganizationSuspended } from "@/features/organizations/actions/set-organization-suspended"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  member,
  organization,
} from "@/features/shared/lib/db/schema"
import { createFixture, type FixtureUser } from "@/tests/support/fixtures"
import { outbox } from "@/tests/support/mail"
import { actAs } from "@/tests/support/request"

// Real Server Actions, called as real sessions: root-only actions refuse a
// tenant owner, and a tenant's own actions refuse its neighbour's owner.

const fixture = await createFixture("authz")
const { root, rootOwner, orgA, orgB, alice, bob, carol } = fixture

afterAll(() => fixture.cleanup())

async function statusOf(organizationId: string) {
  const [row] = await db
    .select({ status: organization.status })
    .from(organization)
    .where(eq(organization.id, organizationId))

  return row?.status
}

async function roleIn(organizationId: string, userId: string) {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )

  return row?.role ?? null
}

async function organizationWithSlug(slug: string) {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))

  return row ?? null
}

async function invitationsTo(email: string) {
  return db
    .select({ id: invitation.id, organizationId: invitation.organizationId })
    .from(invitation)
    .where(eq(invitation.email, email))
}

async function stillOpen(invitationId: string) {
  const rows = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(eq(invitation.id, invitationId))

  return rows.length === 1
}

async function deniedEvents(action: string, actor: FixtureUser) {
  return db
    .select({ id: auditEvent.id })
    .from(auditEvent)
    .where(
      and(
        eq(auditEvent.action, action),
        eq(auditEvent.outcome, "denied"),
        eq(auditEvent.actorUserId, actor.id)
      )
    )
}

// Restores what a test changed, so every test starts from the fixture.
beforeEach(async () => {
  await db
    .update(organization)
    .set({ status: "active", deletedAt: null })
    .where(eq(organization.id, orgA.id))
  await actAs(null)
})

describe("creating an organization", () => {
  const input = (name: string) => ({
    name,
    slug: `authz-${name}-${fixture.suffix}`,
    color: "",
    ownerIds: [alice.id],
  })

  test.each([
    ["a visitor", null],
    ["a tenant owner", alice],
    ["a plain member", carol],
  ])("is refused to %s", async (_name, caller) => {
    await actAs(caller)
    const attempt = input(`refused-${caller?.name.split(" ")[0] ?? "anon"}`)

    expect(await createOrganization(attempt)).toEqual({
      success: false,
      error: "You cannot create organizations",
    })
    expect(await organizationWithSlug(attempt.slug)).toBeNull()
  })

  test("records the refusal", async () => {
    await actAs(bob)
    await createOrganization(input("audited"))

    expect(await deniedEvents("organization.created", bob)).toHaveLength(1)
  })

  test("is allowed to a root owner, who hands it over", async () => {
    await actAs(rootOwner)
    const attempt = input("allowed")
    const result = await createOrganization(attempt)
    const created = await organizationWithSlug(attempt.slug)
    if (created) fixture.trackOrganization(created.id)

    expect(result).toEqual({
      success: true,
      slug: attempt.slug,
      isMember: false,
    })
    expect(created).not.toBeNull()
    expect(await roleIn(created!.id, alice.id)).toBe("owner")
    expect(await roleIn(created!.id, rootOwner.id)).toBeNull()
  })
})

describe("suspending an organization", () => {
  test.each([
    ["its own owner", alice],
    ["another tenant's owner", bob],
    ["a plain member", carol],
  ])("is refused to %s", async (_name, caller) => {
    await actAs(caller)

    expect(await setOrganizationSuspended(orgA.id, true)).toEqual({
      success: false,
      error: "You cannot change organization status",
    })
    expect(await statusOf(orgA.id)).toBe("active")
  })

  test("is refused to a visitor", async () => {
    expect((await setOrganizationSuspended(orgA.id, true)).success).toBe(false)
    expect(await statusOf(orgA.id)).toBe("active")
  })

  test("is the root owner's to impose and lift", async () => {
    await actAs(rootOwner)

    expect(await setOrganizationSuspended(orgA.id, true)).toEqual({
      success: true,
    })
    expect(await statusOf(orgA.id)).toBe("suspended")

    // Nor can its own owner lift it.
    await actAs(alice)
    expect((await setOrganizationSuspended(orgA.id, false)).success).toBe(false)
    expect(await statusOf(orgA.id)).toBe("suspended")

    await actAs(rootOwner)
    expect(await setOrganizationSuspended(orgA.id, false)).toEqual({
      success: true,
    })
    expect(await statusOf(orgA.id)).toBe("active")
  })

  test("never applies to root itself", async () => {
    await actAs(rootOwner)

    expect((await setOrganizationSuspended(root.id, true)).success).toBe(false)
    expect(await statusOf(root.id)).toBe("active")
  })
})

describe("deleting and restoring an organization", () => {
  test.each([
    ["another tenant's owner", bob],
    ["a plain member", carol],
    ["a visitor", null],
  ])("deleting is refused to %s", async (_name, caller) => {
    await actAs(caller)

    expect((await deleteOrganization(orgA.id)).success).toBe(false)
    expect(await statusOf(orgA.id)).toBe("active")
  })

  test("deleting root is refused even to its owner", async () => {
    await actAs(rootOwner)

    expect((await deleteOrganization(root.id)).success).toBe(false)
    expect(await statusOf(root.id)).toBe("active")
  })

  test("an owner deletes, and only root restores", async () => {
    await actAs(alice)
    expect(await deleteOrganization(orgA.id)).toEqual({ success: true })
    expect(await statusOf(orgA.id)).toBe("deleted")

    for (const caller of [alice, bob, carol]) {
      await actAs(caller)
      expect(await restoreOrganization(orgA.id)).toEqual({
        success: false,
        error: "You cannot restore organizations",
      })
    }
    expect(await statusOf(orgA.id)).toBe("deleted")

    await actAs(rootOwner)
    expect(await restoreOrganization(orgA.id)).toEqual({ success: true })
    expect(await statusOf(orgA.id)).toBe("active")
  })

  test("root may delete a tenant it does not belong to", async () => {
    await actAs(rootOwner)

    expect(await deleteOrganization(orgA.id)).toEqual({ success: true })
    expect(await statusOf(orgA.id)).toBe("deleted")
  })

  // The deletion is the organization's lifecycle, so it is the instance's to
  // read even though an owner inside the organization made it.
  test("a deletion by its own owner reaches the instance log", async () => {
    await actAs(alice)
    expect(await deleteOrganization(orgA.id)).toEqual({ success: true })

    await actAs(rootOwner)
    const { events } = await listAuditEvents({
      actions: ["organization.deleted"],
      organizationIds: [orgA.id],
      pageSize: 10,
    })

    expect(
      events.some(
        (event) =>
          event.organization?.id === orgA.id && event.actor.id === alice.id
      )
    ).toBeTrue()
  })
})

const invite = (organizationId: string, label: string) => ({
  organizationId,
  email: `authz-${label}-${fixture.suffix}@example.test`,
  role: "member" as const,
})

describe("inviting someone", () => {
  // Root membership confers nothing inside a tenant.
  test.each([
    ["another tenant's owner", bob],
    ["a plain member", carol],
    ["a root owner", rootOwner],
    ["a visitor", null],
  ])("is refused to %s", async (_name, caller) => {
    await actAs(caller)
    const attempt = invite(orgA.id, `refused-${caller?.id ?? "anon"}`)

    expect(await inviteMember(attempt)).toEqual({
      success: false,
      error: "You cannot invite people to this organization",
    })
    expect(await invitationsTo(attempt.email)).toBeEmpty()
  })

  test("is allowed to the organization's owner", async () => {
    await actAs(alice)
    const attempt = invite(orgA.id, "allowed")
    const sent = outbox.length

    expect(await inviteMember(attempt)).toEqual({
      success: true,
      delivered: true,
    })
    expect(await invitationsTo(attempt.email)).toEqual([
      { id: expect.any(String), organizationId: orgA.id },
    ])
    expect(outbox.slice(sent).map((message) => message.to.address)).toEqual([
      attempt.email,
    ])
  })
})

async function openInvitation(label: string) {
  await actAs(alice)
  const email = `authz-revoke-${label}-${fixture.suffix}@example.test`
  const result = await inviteMember({
    organizationId: orgA.id,
    email,
    role: "member",
  })
  if (!result.success) throw new Error(result.error)

  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(eq(invitation.email, email))

  return row.id
}

describe("withdrawing an invitation", () => {
  test.each([
    ["another tenant's owner", bob],
    ["a plain member", carol],
    ["a root owner", rootOwner],
    ["a visitor", null],
  ])("is refused to %s", async (_name, caller) => {
    const invitationId = await openInvitation(`refused-${caller?.id ?? "anon"}`)
    await actAs(caller)

    expect(await revokeInvitation(orgA.id, invitationId)).toEqual({
      success: false,
      error: "You cannot manage invitations for this organization",
    })
    expect(await stillOpen(invitationId)).toBe(true)
  })

  // Bob administers B, so he passes the guard there, but the invitation is
  // looked up within B and A's cannot be reached through it.
  test("cannot reach another organization's invitation through one's own", async () => {
    const invitationId = await openInvitation("cross-tenant")
    await actAs(bob)

    expect(await revokeInvitation(orgB.id, invitationId)).toEqual({
      success: false,
      error: "That invitation is no longer open",
    })
    expect(await stillOpen(invitationId)).toBe(true)
  })

  test("is allowed to the organization's owner", async () => {
    const invitationId = await openInvitation("allowed")

    expect(await revokeInvitation(orgA.id, invitationId)).toEqual({
      success: true,
    })
    expect(await stillOpen(invitationId)).toBe(false)
  })
})

describe("another organization's members", () => {
  test("cannot be read by a neighbour", async () => {
    await actAs(alice)

    await expect(
      getOrganizationMembers({ organizationId: orgB.id })
    ).rejects.toThrow(ForbiddenError)
  })

  // Root membership confers nothing inside a tenant, reads included.
  test("cannot be read by a root owner who does not belong", async () => {
    await actAs(rootOwner)

    await expect(
      getOrganizationMembers({ organizationId: orgB.id })
    ).rejects.toThrow(ForbiddenError)
  })

  test("cannot be read by a visitor", async () => {
    await expect(
      getOrganizationMembers({ organizationId: orgB.id })
    ).rejects.toThrow(UnauthorizedError)
  })

  test("can be read by the organization's own members", async () => {
    await actAs(bob)
    const result = await getOrganizationMembers({ organizationId: orgB.id })

    expect(result.members.map((row) => row.userId)).toEqual([bob.id])
    expect(result.capabilities.canManageMembers).toBe(true)
  })

  test("cannot have their roles changed by a neighbour", async () => {
    await actAs(alice)

    expect(await setMemberRole(orgB.id, bob.id, "member")).toEqual({
      success: false,
      error: "You cannot change roles in this organization",
    })
    expect(await roleIn(orgB.id, bob.id)).toBe("owner")
  })

  test("cannot be removed by a neighbour", async () => {
    await actAs(alice)

    expect(await removeMember(orgB.id, bob.id)).toEqual({
      success: false,
      error: "You cannot remove members from this organization",
    })
    expect(await roleIn(orgB.id, bob.id)).toBe("owner")
  })

  test("can be managed by the organization's own owner", async () => {
    await actAs(alice)

    expect(await setMemberRole(orgA.id, carol.id, "admin")).toEqual({
      success: true,
    })
    expect(await roleIn(orgA.id, carol.id)).toBe("admin")
    expect(await setMemberRole(orgA.id, carol.id, "member")).toEqual({
      success: true,
    })
  })
})
