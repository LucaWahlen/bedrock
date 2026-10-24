import { and, eq, inArray, like, or } from "drizzle-orm"

import { ensureInitialSetup } from "@/features/organizations/actions/ensure-initial-setup"
import { db } from "@/features/shared/lib/db/client"
import {
  account,
  auditEvent,
  invitation,
  member,
  organization,
  rateLimit,
  session,
  user,
} from "@/features/shared/lib/db/schema"
import { forgetSessions, TEST_USER_AGENT } from "@/tests/support/request"

export type FixtureUser = { id: string; name: string; email: string }

export type FixtureOrganization = { id: string; name: string; slug: string }

export type Fixture = {
  suffix: string
  // The instance's one root organization, never one of the fixture's own.
  root: FixtureOrganization
  // An owner of root, added for this run alongside whoever already is one.
  rootOwner: FixtureUser
  orgA: FixtureOrganization
  orgB: FixtureOrganization
  // Owner of A.
  alice: FixtureUser
  // Owner of B.
  bob: FixtureUser
  // A plain member of A.
  carol: FixtureUser
  createUser: (
    label: string,
    overrides?: Partial<typeof user.$inferInsert>
  ) => Promise<FixtureUser>
  // For rows an action created, so cleanup removes them too.
  trackOrganization: (organizationId: string) => void
  cleanup: () => Promise<void>
}

function findRoot() {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .where(eq(organization.isRoot, true))
    .limit(1)
}

// Bootstrap is the only code allowed to create root, so a database that has
// never booted the app gets it the same way the app would.
async function rootOrganization(): Promise<FixtureOrganization> {
  const [existing] = await findRoot()
  if (existing) return existing

  await ensureInitialSetup()
  const [created] = await findRoot()
  if (!created) throw new Error("Initial setup did not create a root")

  return created
}

// Two tenants with an owner each, a plain member of the first, and an owner of
// root: the least that proves a cross-tenant refusal and a root-only one.
// Everything is unique to this run and removed by `cleanup`.
export async function createFixture(label = "fixture"): Promise<Fixture> {
  const suffix = crypto.randomUUID().slice(0, 8)
  const userIds = new Set<string>()
  const organizationIds = new Set<string>()
  const now = new Date()

  async function createUser(
    name: string,
    overrides: Partial<typeof user.$inferInsert> = {}
  ): Promise<FixtureUser> {
    const values = {
      id: `test-${label}-${suffix}-${name}`,
      name: `${name} ${suffix}`,
      email: `${label}-${name}-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
    userIds.add(values.id)
    await db.insert(user).values(values)

    return { id: values.id, name: values.name, email: values.email }
  }

  async function createOrganization(
    name: string
  ): Promise<FixtureOrganization> {
    const values = {
      id: `test-${label}-${suffix}-${name}`,
      name: `${name} ${suffix}`,
      slug: `test-${label}-${name}-${suffix}`,
      color: "#7c3aed",
      createdAt: now,
    }
    organizationIds.add(values.id)
    await db.insert(organization).values(values)

    return { id: values.id, name: values.name, slug: values.slug }
  }

  async function addMember(
    organizationId: string,
    userId: string,
    role: string
  ) {
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId,
      role,
      createdAt: now,
    })
  }

  async function cleanup() {
    const users = [...userIds]
    const organizations = [...organizationIds]
    const subjects = [...users, ...organizations]

    forgetSessions(users)

    // Audit references are plain columns, so nothing cascades into the log.
    await db
      .delete(auditEvent)
      .where(
        or(
          eq(auditEvent.userAgent, TEST_USER_AGENT),
          users.length > 0 ? inArray(auditEvent.actorUserId, users) : undefined,
          organizations.length > 0
            ? inArray(auditEvent.organizationId, organizations)
            : undefined,
          organizations.length > 0
            ? inArray(auditEvent.actorOrganizationId, organizations)
            : undefined,
          subjects.length > 0
            ? inArray(auditEvent.targetId, subjects)
            : undefined
        )
      )
    if (subjects.length > 0) {
      await db
        .delete(rateLimit)
        .where(or(...subjects.map((id) => like(rateLimit.key, `%${id}%`))))
    }

    if (organizations.length > 0) {
      await db
        .delete(invitation)
        .where(inArray(invitation.organizationId, organizations))
      await db
        .delete(member)
        .where(inArray(member.organizationId, organizations))
      await db
        .delete(organization)
        .where(
          and(
            inArray(organization.id, organizations),
            eq(organization.isRoot, false)
          )
        )
    }

    if (users.length > 0) {
      await db.delete(invitation).where(inArray(invitation.inviterId, users))
      await db.delete(member).where(inArray(member.userId, users))
      await db.delete(session).where(inArray(session.userId, users))
      await db.delete(account).where(inArray(account.userId, users))
      await db.delete(user).where(inArray(user.id, users))
    }

    userIds.clear()
    organizationIds.clear()
  }

  try {
    const root = await rootOrganization()
    const rootOwner = await createUser("root-owner")
    const alice = await createUser("alice")
    const bob = await createUser("bob")
    const carol = await createUser("carol")
    const orgA = await createOrganization("a")
    const orgB = await createOrganization("b")

    await addMember(root.id, rootOwner.id, "owner")
    await addMember(orgA.id, alice.id, "owner")
    await addMember(orgA.id, carol.id, "member")
    await addMember(orgB.id, bob.id, "owner")

    return {
      suffix,
      root,
      rootOwner,
      orgA,
      orgB,
      alice,
      bob,
      carol,
      createUser,
      trackOrganization: (organizationId) => {
        organizationIds.add(organizationId)
      },
      cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}
