import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { getApplicationRoles } from "@/features/applications/actions/get-application-roles"
import { getMemberApplications } from "@/features/applications/actions/get-member-applications"
import { getRoleMembers } from "@/features/applications/actions/get-role-members"
import { setMemberRoles } from "@/features/applications/actions/set-member-roles"
import { setRoleMembers } from "@/features/applications/actions/set-role-members"
import { setMemberGroups } from "@/features/groups/actions/set-member-groups"
import { getOrganizationMembers } from "@/features/organizations/actions/get-organization-members"
import type { JoinedMember } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  applicationRoleGroup,
  applicationRoleMember,
  auditEvent,
  group,
  groupMember,
  member,
  oauthClient,
} from "@/features/shared/lib/db/schema"
import { resolveApplicationAccess } from "@/features/shared/lib/oidc-claims"
import {
  createFixture,
  type Fixture,
  type FixtureUser,
} from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

// Runs against the development database through the real actions and a real
// session, and removes everything it creates. Alice owns A, Carol and Dave are
// plain members of A, Bob owns B.
//
// In A, Engineering grants Billing, and Design grants Billing and Support.
// Carol is in both groups and holds Support directly as well; Dave holds Ops
// directly and is in no group. B mirrors the shape with its own role and group,
// which must never surface in A.

let fixture: Fixture
let dave: FixtureUser
const ids = {
  billing: "",
  support: "",
  ops: "",
  roleB: "",
  engineering: "",
  design: "",
  groupB: "",
  carolMember: "",
  daveMember: "",
  bobMember: "",
  client: "",
}

async function membershipOf(organizationId: string, userId: string) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
  if (!row) throw new Error("No membership")
  return row.id
}

async function membersOfA(
  query: Omit<Parameters<typeof getOrganizationMembers>[0], "organizationId">
) {
  return getOrganizationMembers({ organizationId: fixture.orgA.id, ...query })
}

function joined(
  result: Awaited<ReturnType<typeof getOrganizationMembers>>,
  userId: string
) {
  const row = result.members.find((entry) => entry.userId === userId)
  if (!row || row.pending) throw new Error("No joined member")
  return row as JoinedMember
}

function heldKeys(row: JoinedMember) {
  return row.applicationRoles.map((role) => ({
    key: role.key,
    direct: role.direct,
    groups: role.groups.map((granting) => granting.key),
  }))
}

function summarise(result: Awaited<ReturnType<typeof getRoleMembers>>) {
  return result.success
    ? result.data.map((holder) => ({
        id: holder.id,
        direct: holder.direct,
        groups: holder.groups.map((granting) => granting.key),
      }))
    : result.error
}

beforeAll(async () => {
  fixture = await createFixture("effective")
  const { orgA, orgB, suffix } = fixture
  const now = new Date()

  dave = await fixture.createUser("dave")
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgA.id,
    userId: dave.id,
    role: "member",
    createdAt: now,
  })

  ids.carolMember = await membershipOf(orgA.id, fixture.carol.id)
  ids.daveMember = await membershipOf(orgA.id, dave.id)
  ids.bobMember = await membershipOf(orgB.id, fixture.bob.id)

  const role = (organizationId: string, key: string, name: string) => ({
    id: `effective-${suffix}-${organizationId === orgA.id ? "a" : "b"}-${key}`,
    organizationId,
    key,
    name,
    createdAt: now,
    updatedAt: now,
  })
  const roles = [
    role(orgA.id, "billing", "Billing"),
    role(orgA.id, "support", "Support"),
    role(orgA.id, "ops", "Ops"),
    role(orgB.id, "billing", "Billing"),
  ]
  await db.insert(applicationRole).values(roles)
  ;[ids.billing, ids.support, ids.ops, ids.roleB] = roles.map((row) => row.id)

  const groupRow = (organizationId: string, key: string, name: string) => ({
    id: `effective-${suffix}-${organizationId === orgA.id ? "a" : "b"}-${key}`,
    organizationId,
    key,
    name,
    createdAt: now,
    updatedAt: now,
  })
  const groups = [
    groupRow(orgA.id, "engineering", "Engineering"),
    groupRow(orgA.id, "design", "Design"),
    groupRow(orgB.id, "engineering", "Engineering"),
  ]
  await db.insert(group).values(groups)
  ;[ids.engineering, ids.design, ids.groupB] = groups.map((row) => row.id)

  await db.insert(applicationRoleGroup).values([
    {
      roleId: ids.billing,
      groupId: ids.engineering,
      organizationId: orgA.id,
      createdAt: now,
    },
    {
      roleId: ids.billing,
      groupId: ids.design,
      organizationId: orgA.id,
      createdAt: now,
    },
    {
      roleId: ids.support,
      groupId: ids.design,
      organizationId: orgA.id,
      createdAt: now,
    },
    {
      roleId: ids.roleB,
      groupId: ids.groupB,
      organizationId: orgB.id,
      createdAt: now,
    },
  ])
  await db.insert(groupMember).values([
    {
      groupId: ids.engineering,
      memberId: ids.carolMember,
      organizationId: orgA.id,
      createdAt: now,
    },
    {
      groupId: ids.design,
      memberId: ids.carolMember,
      organizationId: orgA.id,
      createdAt: now,
    },
    {
      groupId: ids.groupB,
      memberId: ids.bobMember,
      organizationId: orgB.id,
      createdAt: now,
    },
  ])
  await db.insert(applicationRoleMember).values([
    { roleId: ids.support, memberId: ids.carolMember, createdAt: now },
    { roleId: ids.ops, memberId: ids.daveMember, createdAt: now },
  ])

  // A client of A covering Billing alone, for the token's view.
  ids.client = `effective-${suffix}-portal`
  await db.insert(oauthClient).values({
    id: ids.client,
    clientId: ids.client,
    name: "Portal",
    redirectUris: ["https://example.test/callback"],
    referenceId: orgA.id,
    metadata: { clientId: ids.client, organizationId: orgA.id },
    createdAt: now,
  })
  await db
    .insert(applicationRoleClient)
    .values({ roleId: ids.billing, clientId: ids.client, createdAt: now })
})

afterAll(async () => {
  await fixture.cleanup()
})

describe("the members table shows effective roles", () => {
  test("a role a group grants is listed with the groups granting it", async () => {
    await actAs(fixture.alice)

    const result = await membersOfA({})

    expect(heldKeys(joined(result, fixture.carol.id))).toEqual([
      { key: "billing", direct: false, groups: ["design", "engineering"] },
      { key: "support", direct: true, groups: ["design"] },
    ])
    expect(heldKeys(joined(result, dave.id))).toEqual([
      { key: "ops", direct: true, groups: [] },
    ])
    expect(heldKeys(joined(result, fixture.alice.id))).toEqual([])
    expect(
      joined(result, fixture.carol.id).groups.map((held) => held.key)
    ).toEqual(["design", "engineering"])
  })

  test("the role filter matches someone who holds the role only through a group", async () => {
    await actAs(fixture.alice)

    const billing = await membersOfA({ applicationRoleIds: [ids.billing] })
    expect(billing.members.map((row) => row.userId)).toEqual([fixture.carol.id])

    const ops = await membersOfA({ applicationRoleIds: [ids.ops] })
    expect(ops.members.map((row) => row.userId)).toEqual([dave.id])
  })

  test("the group filter narrows to the group's members", async () => {
    await actAs(fixture.alice)

    const result = await membersOfA({ groupIds: [ids.engineering] })
    expect(result.total).toBe(1)
    expect(result.members.map((row) => row.userId)).toEqual([fixture.carol.id])
  })

  test("facets count effective holders and group members", async () => {
    await actAs(fixture.alice)

    const result = await membersOfA({})

    expect(result.applicationRoleCounts).toEqual({
      [ids.billing]: 1,
      [ids.support]: 1,
      [ids.ops]: 1,
    })
    expect(result.groupCounts).toEqual({
      [ids.engineering]: 1,
      [ids.design]: 1,
    })
  })
})

describe("nothing of B reaches A's reads", () => {
  test("B's role and group match nobody in A's filters", async () => {
    await actAs(fixture.alice)

    expect((await membersOfA({ applicationRoleIds: [ids.roleB] })).total).toBe(
      0
    )
    expect((await membersOfA({ groupIds: [ids.groupB] })).total).toBe(0)
  })

  test("no row or count in A names B's role or group", async () => {
    await actAs(fixture.alice)

    const result = await membersOfA({})
    const named = result.members.flatMap((row) =>
      row.pending
        ? []
        : [
            ...row.applicationRoles.flatMap((role) => [
              role.id,
              ...role.groups.map((granting) => granting.id),
            ]),
            ...row.groups.map((held) => held.id),
          ]
    )

    expect(named).not.toContain(ids.roleB)
    expect(named).not.toContain(ids.groupB)
    expect(Object.keys(result.applicationRoleCounts)).not.toContain(ids.roleB)
    expect(Object.keys(result.groupCounts)).not.toContain(ids.groupB)
  })

  test("B's role holds nobody when read through A", async () => {
    await actAs(fixture.alice)

    expect(await getRoleMembers(fixture.orgA.id, ids.roleB)).toEqual({
      success: true,
      data: [],
    })
  })

  test("B's owner cannot read A's members or role holders", async () => {
    await actAs(fixture.bob)

    await expect(membersOfA({})).rejects.toThrow()
    expect((await getRoleMembers(fixture.orgA.id, ids.billing)).success).toBe(
      false
    )
  })
})

describe("the roles page counts and lists effective holders", () => {
  test("a role's count includes members holding it through a group", async () => {
    await actAs(fixture.alice)

    const result = await getApplicationRoles({
      organizationId: fixture.orgA.id,
    })
    const counts = Object.fromEntries(
      result.roles.map((role) => [
        role.key,
        [role.memberCount, role.directMemberCount, role.groupMemberCount],
      ])
    )

    expect(counts).toEqual({
      billing: [1, 0, 1],
      ops: [1, 1, 0],
      support: [1, 1, 1],
    })
    expect(
      result.roles
        .find((role) => role.key === "billing")
        ?.memberPreview.map((person) => person.id)
    ).toEqual([fixture.carol.id])
  })

  test("the role's members say who holds it directly and through which group", async () => {
    await actAs(fixture.alice)

    const billing = await getRoleMembers(fixture.orgA.id, ids.billing)
    const support = await getRoleMembers(fixture.orgA.id, ids.support)

    expect(summarise(billing)).toEqual([
      {
        id: fixture.carol.id,
        direct: false,
        groups: ["design", "engineering"],
      },
    ])
    expect(summarise(support)).toEqual([
      { id: fixture.carol.id, direct: true, groups: ["design"] },
    ])
  })
})

describe("direct assignment leaves group grants alone", () => {
  test("clearing Carol's direct roles keeps what her groups grant", async () => {
    await actAs(fixture.alice)

    expect(
      await setMemberRoles({
        organizationId: fixture.orgA.id,
        userId: fixture.carol.id,
        roleIds: [],
      })
    ).toEqual({ success: true })

    const result = await membersOfA({})
    expect(heldKeys(joined(result, fixture.carol.id))).toEqual([
      { key: "billing", direct: false, groups: ["design", "engineering"] },
      { key: "support", direct: false, groups: ["design"] },
    ])
    expect(
      await db
        .select({ groupId: groupMember.groupId })
        .from(groupMember)
        .where(eq(groupMember.memberId, ids.carolMember))
    ).toHaveLength(2)
  })

  test("removing someone from a role they hold only through a group changes nothing", async () => {
    await actAs(fixture.alice)

    expect(
      await setRoleMembers({
        organizationId: fixture.orgA.id,
        roleId: ids.billing,
        add: [],
        remove: [fixture.carol.id],
      })
    ).toEqual({ success: true })

    const holders = await getRoleMembers(fixture.orgA.id, ids.billing)
    expect(holders.success && holders.data.map((holder) => holder.id)).toEqual([
      fixture.carol.id,
    ])
  })

  test("a role given directly on top of a group's grant shows as both", async () => {
    await actAs(fixture.alice)

    expect(
      await setMemberRoles({
        organizationId: fixture.orgA.id,
        userId: fixture.carol.id,
        roleIds: [ids.billing],
      })
    ).toEqual({ success: true })

    const result = await membersOfA({ applicationRoleIds: [ids.billing] })
    expect(heldKeys(joined(result, fixture.carol.id))[0]).toEqual({
      key: "billing",
      direct: true,
      groups: ["design", "engineering"],
    })
  })

  test("the token and the member's own overview carry the same effective roles", async () => {
    const access = await resolveApplicationAccess(fixture.carol.id, ids.client)
    expect(access.roles).toEqual(["billing"])

    await actAs(fixture.carol)
    const applications = await getMemberApplications(fixture.orgA.id)
    expect(
      applications
        .find((application) => application.clientId === ids.client)
        ?.roles.map((role) => role.key)
    ).toEqual(["billing"])
  })
})

describe("managing a member's groups", () => {
  test("an owner of A replaces Carol's groups, audited per group", async () => {
    await actAs(fixture.alice)

    expect(
      await setMemberGroups({
        organizationId: fixture.orgA.id,
        userId: fixture.carol.id,
        groupIds: [ids.engineering],
      })
    ).toEqual({ success: true })

    const result = await membersOfA({})
    const carol = joined(result, fixture.carol.id)
    expect(carol.groups.map((held) => held.key)).toEqual(["engineering"])
    // Design took Support with it; Billing is still direct and via Engineering.
    expect(heldKeys(carol)).toEqual([
      { key: "billing", direct: true, groups: ["engineering"] },
    ])

    const events = await db
      .select({ targetId: auditEvent.targetId, outcome: auditEvent.outcome })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.organizationId, fixture.orgA.id),
          eq(auditEvent.action, "group.members_changed")
        )
      )
    expect(events).toEqual([{ targetId: ids.design, outcome: "success" }])
  })

  test("another organization's group is refused and nothing changes", async () => {
    await actAs(fixture.alice)

    expect(
      await setMemberGroups({
        organizationId: fixture.orgA.id,
        userId: fixture.carol.id,
        groupIds: [ids.engineering, ids.groupB],
      })
    ).toEqual({ success: false, error: "Unknown group" })
    expect(
      await db
        .select({ groupId: groupMember.groupId })
        .from(groupMember)
        .where(eq(groupMember.memberId, ids.carolMember))
    ).toEqual([{ groupId: ids.engineering }])
  })

  test("someone outside the organization cannot be put in its groups", async () => {
    await actAs(fixture.alice)

    expect(
      await setMemberGroups({
        organizationId: fixture.orgA.id,
        userId: fixture.bob.id,
        groupIds: [ids.engineering],
      })
    ).toEqual({ success: false, error: "Not a member of this organization" })
  })

  test("B's owner cannot change A's groups", async () => {
    await actAs(fixture.bob)

    const result = await setMemberGroups({
      organizationId: fixture.orgA.id,
      userId: fixture.carol.id,
      groupIds: [],
    })
    expect(result.success).toBe(false)
  })
})

describe("a plain member", () => {
  test("sees no application roles or groups and cannot filter by them", async () => {
    await actAs(fixture.carol)

    const result = await membersOfA({ applicationRoleIds: [ids.billing] })
    expect(result.capabilities.canManageApplicationRoles).toBe(false)
    // The filter is ignored rather than honoured for someone who cannot see it.
    expect(result.total).toBeGreaterThan(1)
    expect(
      result.members.every(
        (row) =>
          row.pending ||
          (row.applicationRoles.length === 0 && row.groups.length === 0)
      )
    ).toBe(true)
    expect(result.applicationRoleCounts).toEqual({})
    expect(result.groupCounts).toEqual({})
  })

  test("is refused every role and group mutation and read", async () => {
    await actAs(fixture.carol)

    expect((await getRoleMembers(fixture.orgA.id, ids.billing)).success).toBe(
      false
    )
    expect(
      (
        await setMemberRoles({
          organizationId: fixture.orgA.id,
          userId: dave.id,
          roleIds: [ids.billing],
        })
      ).success
    ).toBe(false)
    expect(
      (
        await setMemberGroups({
          organizationId: fixture.orgA.id,
          userId: dave.id,
          groupIds: [ids.engineering],
        })
      ).success
    ).toBe(false)
    expect(
      await db
        .select({ groupId: groupMember.groupId })
        .from(groupMember)
        .where(eq(groupMember.memberId, ids.daveMember))
    ).toEqual([])
  })
})
