import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { setRoleGroups } from "@/features/applications/actions/set-role-groups"
import { auth } from "@/features/auth/lib/auth"
import { deleteGroup } from "@/features/groups/actions/delete-group"
import { getGroupMembers } from "@/features/groups/actions/get-group-members"
import { getGroupOptions } from "@/features/groups/actions/get-group-options"
import { getGroups } from "@/features/groups/actions/get-groups"
import { saveGroup } from "@/features/groups/actions/save-group"
import { setGroupMembers } from "@/features/groups/actions/set-group-members"
import { setGroupRoles } from "@/features/groups/actions/set-group-roles"
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
import { createFixture, type Fixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

// Runs against the development database through the real actions and a real
// session, and removes everything it creates. Alice owns A, Carol is a plain
// member of A, Bob owns B. Groups must never reach across that line, whether
// the attempt comes through an action or straight at the database.

let fixture: Fixture
let groupA: string
let roleA: string
let roleB: string
let portalClient: string
let wikiClient: string

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

async function groupIdByKey(organizationId: string, key: string) {
  const [row] = await db
    .select({ id: group.id })
    .from(group)
    .where(and(eq(group.organizationId, organizationId), eq(group.key, key)))
  return row?.id ?? null
}

async function auditActions(organizationId: string) {
  const rows = await db
    .select({ action: auditEvent.action, outcome: auditEvent.outcome })
    .from(auditEvent)
    .where(eq(auditEvent.organizationId, organizationId))
  return rows
}

async function insertClient(clientId: string, organizationId: string) {
  await db.insert(oauthClient).values({
    id: clientId,
    clientId,
    name: clientId,
    redirectUris: ["https://example.test/callback"],
    referenceId: organizationId,
    metadata: { clientId, organizationId },
    createdAt: new Date(),
  })
}

type ClaimCallback = (info: {
  user: { id: string; name: string }
  scopes: string[]
  metadata?: Record<string, unknown>
}) => Promise<Record<string, unknown>>

// The provider's own callbacks, so the scope rule is tested where it is applied.
function providerOptions() {
  const plugin = auth.options.plugins.find(
    (candidate) => candidate.id === "oauth-provider"
  ) as unknown as {
    options: {
      customIdTokenClaims: ClaimCallback
      customAccessTokenClaims: ClaimCallback
      customUserInfoClaims: (info: {
        user: { id: string; name: string }
        scopes: string[]
        jwt: Record<string, unknown>
      }) => Promise<Record<string, unknown>>
    }
  }
  return plugin.options
}

beforeAll(async () => {
  fixture = await createFixture("groups")
  const { orgA, orgB, suffix } = fixture
  const now = new Date()

  portalClient = `groups-${suffix}-portal`
  wikiClient = `groups-${suffix}-wiki`
  await insertClient(portalClient, orgA.id)
  await insertClient(wikiClient, orgA.id)

  roleA = `groups-${suffix}-role-a`
  roleB = `groups-${suffix}-role-b`
  await db.insert(applicationRole).values([
    {
      id: roleA,
      organizationId: orgA.id,
      key: "billing",
      name: "Billing",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: roleB,
      organizationId: orgB.id,
      key: "billing",
      name: "Billing",
      createdAt: now,
      updatedAt: now,
    },
  ])
  // Billing belongs to the portal alone.
  await db
    .insert(applicationRoleClient)
    .values({ roleId: roleA, clientId: portalClient, createdAt: now })
})

afterAll(async () => {
  await fixture.cleanup()
})

describe("creating and editing a group", () => {
  test("an owner of A creates a group, audited in A", async () => {
    await actAs(fixture.alice)

    expect(
      await saveGroup({
        organizationId: fixture.orgA.id,
        key: "engineering",
        name: "Engineering",
        memberUserIds: [fixture.carol.id],
      })
    ).toEqual({ success: true })

    const id = await groupIdByKey(fixture.orgA.id, "engineering")
    expect(id).not.toBeNull()
    groupA = id as string

    const result = await getGroups({ organizationId: fixture.orgA.id })
    expect(
      result.groups.map((entry) => [entry.key, entry.memberCount])
    ).toEqual([["engineering", 1]])
    expect(await auditActions(fixture.orgA.id)).toContainEqual({
      action: "group.created",
      outcome: "success",
    })
  })

  test("a key that is not slug-like is refused", async () => {
    await actAs(fixture.alice)

    const result = await saveGroup({
      organizationId: fixture.orgA.id,
      key: "Not A Key",
      name: "Broken",
    })

    expect(result.success).toBe(false)
  })

  test("a duplicate key in the same organization is refused", async () => {
    await actAs(fixture.alice)

    expect(
      await saveGroup({
        organizationId: fixture.orgA.id,
        key: "engineering",
        name: "Again",
      })
    ).toEqual({ success: false, error: "A group with this key already exists" })
  })

  test("the key is immutable: an edit renames but keeps the stored key", async () => {
    await actAs(fixture.alice)

    expect(
      await saveGroup({
        organizationId: fixture.orgA.id,
        groupId: groupA,
        key: "renamed-key",
        name: "Platform engineering",
      })
    ).toEqual({ success: true })

    const [stored] = await db
      .select({ key: group.key, name: group.name })
      .from(group)
      .where(eq(group.id, groupA))
    expect(stored).toEqual({ key: "engineering", name: "Platform engineering" })
  })

  test("an edit cannot slip in members or roles", async () => {
    await actAs(fixture.alice)

    const result = await saveGroup({
      organizationId: fixture.orgA.id,
      groupId: groupA,
      key: "engineering",
      name: "Platform engineering",
      roleIds: [roleA],
    })

    expect(result.success).toBe(false)
  })
})

describe("who may manage groups", () => {
  test("a plain member is refused reads and writes", async () => {
    await actAs(fixture.carol)

    await expect(
      getGroups({ organizationId: fixture.orgA.id })
    ).rejects.toThrow()
    await expect(getGroupOptions(fixture.orgA.id)).rejects.toThrow()
    expect((await getGroupMembers(fixture.orgA.id, groupA)).success).toBe(false)
    expect(
      (
        await saveGroup({
          organizationId: fixture.orgA.id,
          key: "sneaky",
          name: "Sneaky",
        })
      ).success
    ).toBe(false)
    expect((await deleteGroup(fixture.orgA.id, groupA)).success).toBe(false)
    expect(await groupIdByKey(fixture.orgA.id, "sneaky")).toBeNull()
  })

  test("the owner of B can neither read nor change A's groups", async () => {
    await actAs(fixture.bob)

    await expect(
      getGroups({ organizationId: fixture.orgA.id })
    ).rejects.toThrow()
    expect((await getGroupMembers(fixture.orgA.id, groupA)).success).toBe(false)
    expect(
      (
        await setGroupMembers({
          organizationId: fixture.orgA.id,
          groupId: groupA,
          add: [fixture.bob.id],
          remove: [],
        })
      ).success
    ).toBe(false)
    expect(
      (
        await setGroupRoles({
          organizationId: fixture.orgA.id,
          groupId: groupA,
          roleIds: [],
        })
      ).success
    ).toBe(false)
    expect((await deleteGroup(fixture.orgA.id, groupA)).success).toBe(false)
  })

  test("A's group id named under B, where Bob is owner, is unknown", async () => {
    await actAs(fixture.bob)

    expect(await deleteGroup(fixture.orgB.id, groupA)).toEqual({
      success: false,
      error: "Unknown group",
    })
    expect(
      await setGroupMembers({
        organizationId: fixture.orgB.id,
        groupId: groupA,
        add: [fixture.bob.id],
        remove: [],
      })
    ).toEqual({ success: false, error: "Unknown group" })
    expect(await groupIdByKey(fixture.orgA.id, "engineering")).toBe(groupA)
  })

  test("refusals are recorded against the organization", async () => {
    expect(await auditActions(fixture.orgA.id)).toContainEqual({
      action: "group.deleted",
      outcome: "denied",
    })
  })

  test("root has no groups, even for its owner", async () => {
    await actAs(fixture.rootOwner)

    expect(
      (
        await saveGroup({
          organizationId: fixture.root.id,
          key: "operators",
          name: "Operators",
        })
      ).success
    ).toBe(false)
    expect(await groupIdByKey(fixture.root.id, "operators")).toBeNull()
  })
})

describe("group membership stays inside the organization", () => {
  test("a member of B cannot be added to A's group", async () => {
    await actAs(fixture.alice)

    expect(
      await setGroupMembers({
        organizationId: fixture.orgA.id,
        groupId: groupA,
        add: [fixture.bob.id],
        remove: [],
      })
    ).toEqual({ success: false, error: "Not a member of this organization" })
  })

  test("a member of A is added and removed, audited", async () => {
    await actAs(fixture.alice)

    for (const change of [
      { add: [fixture.alice.id], remove: [] },
      { add: [], remove: [fixture.alice.id] },
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      const result = await setGroupMembers({
        organizationId: fixture.orgA.id,
        groupId: groupA,
        ...change,
      })
      expect(result).toEqual({ success: true })
    }

    const changes = (await auditActions(fixture.orgA.id)).filter(
      (event) =>
        event.action === "group.members_changed" && event.outcome === "success"
    )
    expect(changes).toHaveLength(2)
    expect((await getGroupMembers(fixture.orgA.id, groupA)).success).toBe(true)
  })

  test("the database refuses it too, whichever organization is claimed", async () => {
    const bobInB = await membershipOf(fixture.orgB.id, fixture.bob.id)

    for (const organizationId of [fixture.orgA.id, fixture.orgB.id]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        db
          .insert(groupMember)
          .values({
            groupId: groupA,
            memberId: bobInB,
            organizationId,
            createdAt: new Date(),
          })
          .execute()
      ).rejects.toThrow()
    }
  })
})

describe("roles granted by a group stay inside the organization", () => {
  test("A's group cannot be granted B's role, from either side", async () => {
    await actAs(fixture.alice)
    expect(
      await setGroupRoles({
        organizationId: fixture.orgA.id,
        groupId: groupA,
        roleIds: [roleB],
      })
    ).toEqual({ success: false, error: "Unknown role" })

    await actAs(fixture.bob)
    expect(
      await setRoleGroups({
        organizationId: fixture.orgB.id,
        roleId: roleB,
        groupIds: [groupA],
      })
    ).toEqual({ success: false, error: "Unknown group" })
  })

  test("the database refuses the link, whichever organization is claimed", async () => {
    for (const organizationId of [fixture.orgA.id, fixture.orgB.id]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        db
          .insert(applicationRoleGroup)
          .values({
            roleId: roleB,
            groupId: groupA,
            organizationId,
            createdAt: new Date(),
          })
          .execute()
      ).rejects.toThrow()
    }
  })

  test("the role side grants A's role to A's group, audited", async () => {
    await actAs(fixture.alice)

    expect(
      await setRoleGroups({
        organizationId: fixture.orgA.id,
        roleId: roleA,
        groupIds: [groupA],
      })
    ).toEqual({ success: true })
    expect(await auditActions(fixture.orgA.id)).toContainEqual({
      action: "application.role_groups_changed",
      outcome: "success",
    })

    const [listed] = (await getGroups({ organizationId: fixture.orgA.id }))
      .groups
    expect(listed?.roles.map((role) => role.id)).toEqual([roleA])
  })

  test("the group side replaces the same set, audited only on change", async () => {
    await actAs(fixture.alice)

    expect(
      await setGroupRoles({
        organizationId: fixture.orgA.id,
        groupId: groupA,
        roleIds: [],
      })
    ).toEqual({ success: true })
    expect(
      await setGroupRoles({
        organizationId: fixture.orgA.id,
        groupId: groupA,
        roleIds: [roleA],
      })
    ).toEqual({ success: true })

    const changes = (await auditActions(fixture.orgA.id)).filter(
      (event) =>
        event.action === "group.roles_changed" && event.outcome === "success"
    )
    expect(changes).toHaveLength(2)
  })
})

describe("what an application learns about a member's groups", () => {
  test("a role held through a group reaches only the clients it covers", async () => {
    const portal = await resolveApplicationAccess(
      fixture.carol.id,
      portalClient
    )
    const wiki = await resolveApplicationAccess(fixture.carol.id, wikiClient)

    expect(portal.roles).toEqual(["billing"])
    expect(wiki.roles).toEqual([])
    expect(portal.groups).toEqual(["engineering"])
    expect(wiki.groups).toEqual(["engineering"])
  })

  test("direct and group roles are one sorted set without duplicates", async () => {
    const carolInA = await membershipOf(fixture.orgA.id, fixture.carol.id)
    await db.insert(applicationRoleClient).values({
      roleId: roleA,
      clientId: wikiClient,
      createdAt: new Date(),
    })
    await db.insert(applicationRoleMember).values({
      roleId: roleA,
      memberId: carolInA,
      createdAt: new Date(),
    })

    const wiki = await resolveApplicationAccess(fixture.carol.id, wikiClient)
    expect(wiki.roles).toEqual(["billing"])

    await db
      .delete(applicationRoleMember)
      .where(eq(applicationRoleMember.memberId, carolInA))
    await db
      .delete(applicationRoleClient)
      .where(
        and(
          eq(applicationRoleClient.roleId, roleA),
          eq(applicationRoleClient.clientId, wikiClient)
        )
      )
  })

  test("the groups claim appears only when the groups scope was granted", async () => {
    const options = providerOptions()
    const metadata = { clientId: portalClient }
    const person = { id: fixture.carol.id, name: "Carol" }

    for (const callback of [
      options.customIdTokenClaims,
      options.customAccessTokenClaims,
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      const without = await callback({
        user: person,
        scopes: ["openid", "roles"],
        metadata,
      })
      expect(without.preferred_username).toBeUndefined()
      expect(without["urn:bedrock:groups"]).toBeUndefined()
      expect(without["urn:bedrock:roles"]).toEqual(["billing"])

      // oxlint-disable-next-line no-await-in-loop
      const granted = await callback({
        user: person,
        scopes: ["openid", "profile", "groups"],
        metadata,
      })
      expect(granted.preferred_username).toBe("Carol")
      expect(granted["urn:bedrock:groups"]).toEqual(["engineering"])
      expect(granted["urn:bedrock:roles"]).toBeUndefined()
    }

    const userinfo = await options.customUserInfoClaims({
      user: person,
      scopes: ["openid", "profile", "roles", "groups"],
      jwt: { client_id: portalClient },
    })
    expect(userinfo).toMatchObject({
      "urn:bedrock:organization": fixture.orgA.slug,
      preferred_username: "Carol",
      "urn:bedrock:roles": ["billing"],
      "urn:bedrock:groups": ["engineering"],
    })

    const plain = await options.customUserInfoClaims({
      user: person,
      scopes: ["openid"],
      jwt: { client_id: portalClient },
    })
    expect(plain["urn:bedrock:groups"]).toBeUndefined()
    expect(plain.preferred_username).toBeUndefined()
  })

  test("a departed member's groups, and the roles they granted, vanish", async () => {
    const carolInA = await membershipOf(fixture.orgA.id, fixture.carol.id)
    await db.delete(member).where(eq(member.id, carolInA))

    const remaining = await db
      .select({ groupId: groupMember.groupId })
      .from(groupMember)
      .where(eq(groupMember.memberId, carolInA))
    expect(remaining).toEqual([])

    await expect(
      resolveApplicationAccess(fixture.carol.id, portalClient)
    ).rejects.toThrow(/not a member/i)
    await expect(
      providerOptions().customUserInfoClaims({
        user: { id: fixture.carol.id, name: "Carol" },
        scopes: ["openid", "groups"],
        jwt: { client_id: portalClient },
      })
    ).rejects.toThrow()

    // Rejoining is a new membership, which starts in no group.
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: fixture.orgA.id,
      userId: fixture.carol.id,
      role: "member",
      createdAt: new Date(),
    })
    const rejoined = await resolveApplicationAccess(
      fixture.carol.id,
      portalClient
    )
    expect(rejoined.roles).toEqual([])
    expect(rejoined.groups).toEqual([])
  })
})

describe("deleting a group", () => {
  test("an owner deletes it, and what it granted goes with it", async () => {
    await actAs(fixture.alice)

    expect(await deleteGroup(fixture.orgA.id, groupA)).toEqual({
      success: true,
    })
    expect(await groupIdByKey(fixture.orgA.id, "engineering")).toBeNull()

    const links = await db
      .select({ roleId: applicationRoleGroup.roleId })
      .from(applicationRoleGroup)
      .where(eq(applicationRoleGroup.groupId, groupA))
    expect(links).toEqual([])
    expect(await auditActions(fixture.orgA.id)).toContainEqual({
      action: "group.deleted",
      outcome: "success",
    })
  })
})
