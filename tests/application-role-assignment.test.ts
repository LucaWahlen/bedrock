import { afterAll, describe, expect, test } from "bun:test"

import { eq, inArray } from "drizzle-orm"

import {
  changeRoleMembers,
  replaceMemberRoles,
} from "@/features/applications/lib/role-assignment"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleMember,
  member,
  organization,
  user,
} from "@/features/shared/lib/db/schema"

// Runs against the development database and removes every row it creates.
// Two tenants, each with its own member and role, prove that neither side of an
// assignment can be named across the boundary.

const suffix = crypto.randomUUID().slice(0, 8)
const now = new Date()
const orgA = `test-org-${suffix}-a`
const orgB = `test-org-${suffix}-b`
const alice = `test-usr-${suffix}-alice`
const carol = `test-usr-${suffix}-carol`
const bob = `test-usr-${suffix}-bob`
const roleA = `test-role-${suffix}-a`
const roleB = `test-role-${suffix}-b`

await db.insert(user).values(
  [alice, carol, bob].map((id) => ({
    id,
    name: id,
    email: `${id}@example.test`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  }))
)

await db.insert(organization).values(
  [orgA, orgB].map((id) => ({
    id,
    name: id,
    slug: id,
    createdAt: now,
    color: "#7c3aed",
  }))
)

await db.insert(member).values([
  {
    id: `${alice}-m`,
    organizationId: orgA,
    userId: alice,
    role: "member",
    createdAt: now,
  },
  {
    id: `${carol}-m`,
    organizationId: orgA,
    userId: carol,
    role: "member",
    createdAt: now,
  },
  {
    id: `${bob}-m`,
    organizationId: orgB,
    userId: bob,
    role: "member",
    createdAt: now,
  },
])

await db.insert(applicationRole).values([
  {
    id: roleA,
    organizationId: orgA,
    key: "editor",
    name: "Editor",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: roleB,
    organizationId: orgB,
    key: "editor",
    name: "Editor",
    createdAt: now,
    updatedAt: now,
  },
])

afterAll(async () => {
  await db.delete(organization).where(inArray(organization.id, [orgA, orgB]))
  await db.delete(user).where(inArray(user.id, [alice, carol, bob]))
})

async function rolesOf(memberId: string) {
  const rows = await db
    .select({ roleId: applicationRoleMember.roleId })
    .from(applicationRoleMember)
    .where(eq(applicationRoleMember.memberId, memberId))

  return rows.map((row) => row.roleId)
}

describe("assigning roles to a member", () => {
  test("a role of the same organization is assigned and reported", async () => {
    const result = await replaceMemberRoles(db, orgA, alice, [roleA])

    expect(result.ok && result.added.map((role) => role.key)).toEqual([
      "editor",
    ])
    expect(await rolesOf(`${alice}-m`)).toEqual([roleA])
  })

  test("saving the same set changes nothing", async () => {
    const result = await replaceMemberRoles(db, orgA, alice, [roleA])

    expect(result.ok && [result.added, result.removed]).toEqual([[], []])
  })

  test("another organization's role is refused", async () => {
    const result = await replaceMemberRoles(db, orgA, alice, [roleB])

    expect(result.ok).toBe(false)
    expect(await rolesOf(`${alice}-m`)).toEqual([roleA])
  })

  test("another organization's member is refused", async () => {
    const result = await replaceMemberRoles(db, orgA, bob, [roleA])

    expect(result.ok).toBe(false)
    expect(await rolesOf(`${bob}-m`)).toEqual([])
  })

  test("an empty set removes what was held", async () => {
    const result = await replaceMemberRoles(db, orgA, alice, [])

    expect(result.ok && result.removed.map((role) => role.id)).toEqual([roleA])
    expect(await rolesOf(`${alice}-m`)).toEqual([])
  })
})

describe("changing who holds a role", () => {
  test("members of the same organization are added", async () => {
    const result = await changeRoleMembers(db, orgA, roleA, {
      add: [alice, carol],
      remove: [],
    })

    expect(result.ok && result.added.length).toBe(2)
  })

  // The caller sends the change, so a holder it never listed is untouched.
  test("removing one holder keeps the others", async () => {
    const result = await changeRoleMembers(db, orgA, roleA, {
      add: [],
      remove: [carol],
    })

    expect(result.ok && result.removed.map((person) => person.userId)).toEqual([
      carol,
    ])
    expect(await rolesOf(`${alice}-m`)).toEqual([roleA])
    expect(await rolesOf(`${carol}-m`)).toEqual([])
  })

  test("another organization's member is refused", async () => {
    const result = await changeRoleMembers(db, orgA, roleA, {
      add: [bob],
      remove: [],
    })

    expect(result.ok).toBe(false)
    expect(await rolesOf(`${bob}-m`)).toEqual([])
  })

  test("another organization's role is refused", async () => {
    const result = await changeRoleMembers(db, orgA, roleB, {
      add: [alice],
      remove: [],
    })

    expect(result.ok).toBe(false)
    expect(await rolesOf(`${alice}-m`)).toEqual([roleA])
  })
})
