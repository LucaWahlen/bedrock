import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { eq, inArray } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  applicationRoleMember,
  member,
  oauthClient,
  organization,
  user,
} from "@/features/shared/lib/db/schema"
import { resolveApplicationAccess } from "@/features/shared/lib/oidc-claims"

// This is what stands between a valid Bedrock session and a token for someone
// else's application, so it is exercised against the real database rather than
// reasoned about. Everything created here is namespaced and removed afterwards.

const suffix = crypto.randomUUID().slice(0, 8)
const id = (name: string) => `oidc-test-${suffix}-${name}`

const orgId = id("org")
const otherOrgId = id("other-org")
const memberUserId = id("member")
const strangerUserId = id("stranger")
const portalClientId = id("portal")
const wikiClientId = id("wiki")
const membershipId = id("membership")
const sharedRoleId = id("role-shared")
const portalRoleId = id("role-portal")

async function makeUser(userId: string) {
  await db.insert(user).values({
    id: userId,
    name: userId,
    email: `${userId}@example.test`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

async function makeOrganization(organizationId: string) {
  await db.insert(organization).values({
    id: organizationId,
    name: organizationId,
    slug: organizationId,
    createdAt: new Date(),
  })
}

async function makeApplication(clientId: string, organizationId: string) {
  await db.insert(oauthClient).values({
    id: clientId,
    clientId,
    name: clientId,
    redirectUris: ["https://example.test/callback"],
    referenceId: organizationId,
    createdAt: new Date(),
  })
}

beforeAll(async () => {
  await makeUser(memberUserId)
  await makeUser(strangerUserId)
  await makeOrganization(orgId)
  await makeOrganization(otherOrgId)
  await makeApplication(portalClientId, orgId)
  await makeApplication(wikiClientId, orgId)

  await db.insert(member).values({
    id: membershipId,
    organizationId: orgId,
    userId: memberUserId,
    role: "member",
    createdAt: new Date(),
  })

  await db.insert(applicationRole).values([
    {
      id: sharedRoleId,
      organizationId: orgId,
      key: "editor",
      name: "Editor",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: portalRoleId,
      organizationId: orgId,
      key: "billing",
      name: "Billing",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  // "editor" spans both applications; "billing" belongs to the portal alone.
  await db.insert(applicationRoleClient).values([
    { roleId: sharedRoleId, clientId: portalClientId, createdAt: new Date() },
    { roleId: sharedRoleId, clientId: wikiClientId, createdAt: new Date() },
    { roleId: portalRoleId, clientId: portalClientId, createdAt: new Date() },
  ])

  await db.insert(applicationRoleMember).values([
    { roleId: sharedRoleId, memberId: membershipId, createdAt: new Date() },
    { roleId: portalRoleId, memberId: membershipId, createdAt: new Date() },
  ])
})

afterAll(async () => {
  await db
    .delete(organization)
    .where(inArray(organization.id, [orgId, otherOrgId]))
  await db.delete(user).where(inArray(user.id, [memberUserId, strangerUserId]))
})

describe("what an application learns about a member", () => {
  test("the organization that owns it", async () => {
    const access = await resolveApplicationAccess(memberUserId, portalClientId)

    expect(access.organizationSlug).toBe(orgId)
  })

  // The point of a role spanning applications: one name, the same meaning in
  // each of them.
  test("a role attached to two applications appears in both", async () => {
    const portal = await resolveApplicationAccess(memberUserId, portalClientId)
    const wiki = await resolveApplicationAccess(memberUserId, wikiClientId)

    expect(portal.roles).toContain("editor")
    expect(wiki.roles).toContain("editor")
  })

  test("a role attached to one application stays out of the other", async () => {
    const wiki = await resolveApplicationAccess(memberUserId, wikiClientId)

    expect(wiki.roles).not.toContain("billing")
  })
})

describe("who is refused a token", () => {
  test("someone who is not a member of the owning organization", async () => {
    await expect(
      resolveApplicationAccess(strangerUserId, portalClientId)
    ).rejects.toThrow(/not a member/i)
  })

  test("a member of a suspended organization", async () => {
    await db
      .update(organization)
      .set({ status: "suspended", statusChangedAt: new Date() })
      .where(eq(organization.id, orgId))

    await expect(
      resolveApplicationAccess(memberUserId, portalClientId)
    ).rejects.toThrow(/not active/i)

    await db
      .update(organization)
      .set({ status: "active" })
      .where(eq(organization.id, orgId))
  })

  test("an application belonging to no organization", async () => {
    await expect(
      resolveApplicationAccess(memberUserId, "does-not-exist")
    ).rejects.toThrow(/not registered/i)
  })
})

// Roles hang off the membership, so losing the membership loses them without
// anything having to remember to clean up.
describe("when someone leaves the organization", () => {
  test("their roles go with the membership", async () => {
    await db.delete(member).where(eq(member.id, membershipId))

    const remaining = await db
      .select({ roleId: applicationRoleMember.roleId })
      .from(applicationRoleMember)
      .where(eq(applicationRoleMember.memberId, membershipId))

    expect(remaining).toEqual([])

    await expect(
      resolveApplicationAccess(memberUserId, portalClientId)
    ).rejects.toThrow(/not a member/i)
  })
})
