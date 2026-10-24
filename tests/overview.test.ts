import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { createApplication } from "@/features/applications/actions/create-application"
import { getApplicationSummary } from "@/features/applications/actions/get-application-summary"
import { getInstanceApplicationCounts } from "@/features/applications/actions/get-instance-application-counts"
import { getMemberApplications } from "@/features/applications/actions/get-member-applications"
import { updateApplication } from "@/features/applications/actions/update-application"
import {
  createApplicationSchema,
  createLaunchUrlSchema,
} from "@/features/applications/schemas/application"
import {
  isLaunchUrlAllowed,
  launchUrlOf,
} from "@/features/applications/utils/launch-url"
import { getAuditLogAccess } from "@/features/audit/actions/get-audit-log-access"
import { listAuditEvents } from "@/features/audit/actions/list-audit-events"
import { getInstanceSummary } from "@/features/organizations/actions/get-instance-summary"
import { getMemberOrganizations } from "@/features/organizations/actions/get-member-organizations"
import { getMembershipSummary } from "@/features/organizations/actions/get-membership-summary"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  applicationRoleMember,
  auditEvent,
  invitation,
  member,
  oauthClient,
  organization,
} from "@/features/shared/lib/db/schema"
import { translatorFor } from "@/features/shared/lib/i18n/translator"
import { createFixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

// Every read behind the overview, called as real sessions. Rows live in the
// fixture's organizations, so removing those cascades to everything here.

const fixture = await createFixture("overview")
const { root, rootOwner, orgA, orgB, alice, bob, carol, suffix } = fixture
const tApplications = translatorFor("en", "applications")
const applicationSchema = createApplicationSchema(tApplications)
const now = new Date()
const inAWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

const clientIds = {
  a: `test-overview-${suffix}-a`,
  aDisabled: `test-overview-${suffix}-a-disabled`,
  b: `test-overview-${suffix}-b`,
}

// Someone in both tenants, so their other organizations have something to list.
const dave = await fixture.createUser("dave")

function client(
  clientId: string,
  organizationId: string,
  values: Partial<typeof oauthClient.$inferInsert> = {}
): typeof oauthClient.$inferInsert {
  return {
    id: clientId,
    clientId,
    name: clientId,
    redirectUris: ["https://app.example.test/callback"],
    referenceId: organizationId,
    createdAt: now,
    updatedAt: now,
    ...values,
  }
}

beforeAll(async () => {
  await db.insert(member).values([
    {
      id: `${dave.id}-a`,
      organizationId: orgA.id,
      userId: dave.id,
      role: "member",
      createdAt: now,
    },
    {
      id: `${dave.id}-b`,
      organizationId: orgB.id,
      userId: dave.id,
      role: "admin",
      createdAt: now,
    },
  ])

  await db.insert(oauthClient).values([
    client(clientIds.a, orgA.id, { uri: "https://a.example.test" }),
    client(clientIds.aDisabled, orgA.id, { disabled: true }),
    // Stored before validation existed, so it must not become a link.
    client(clientIds.b, orgB.id, { uri: "javascript:alert(1)" }),
  ])

  await db.insert(applicationRole).values([
    {
      id: `${clientIds.a}-editor`,
      organizationId: orgA.id,
      key: "editor",
      name: "Editor",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${clientIds.a}-viewer`,
      organizationId: orgA.id,
      key: "viewer",
      name: "Viewer",
      createdAt: now,
      updatedAt: now,
    },
  ])
  await db.insert(applicationRoleClient).values([
    { roleId: `${clientIds.a}-editor`, clientId: clientIds.a, createdAt: now },
    { roleId: `${clientIds.a}-viewer`, clientId: clientIds.a, createdAt: now },
  ])

  const [carolMembership] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, carol.id))
  await db.insert(applicationRoleMember).values({
    roleId: `${clientIds.a}-editor`,
    memberId: carolMembership.id,
    createdAt: now,
  })

  await db.insert(invitation).values([
    {
      id: `test-overview-${suffix}-invite-a`,
      organizationId: orgA.id,
      email: `invitee-a-${suffix}@example.test`,
      role: "admin",
      expiresAt: inAWeek,
      createdAt: now,
      lastSentAt: now,
      inviterId: alice.id,
      tokenHash: `test-overview-${suffix}-a`,
    },
    {
      id: `test-overview-${suffix}-invite-a-expired`,
      organizationId: orgA.id,
      email: `expired-a-${suffix}@example.test`,
      role: "member",
      expiresAt: new Date(now.getTime() - 1000),
      createdAt: now,
      lastSentAt: now,
      inviterId: alice.id,
      tokenHash: `test-overview-${suffix}-a-expired`,
    },
    {
      id: `test-overview-${suffix}-invite-b`,
      organizationId: orgB.id,
      email: `invitee-b-${suffix}@example.test`,
      role: "member",
      expiresAt: inAWeek,
      createdAt: now,
      lastSentAt: now,
      inviterId: bob.id,
      tokenHash: `test-overview-${suffix}-b`,
    },
  ])
})

afterAll(() => fixture.cleanup())

describe("your applications", () => {
  test("lists only this organization's enabled applications", async () => {
    await actAs(carol)
    const applications = await getMemberApplications(orgA.id)

    expect(applications.map((application) => application.clientId)).toEqual([
      clientIds.a,
    ])
  })

  test("shows only the roles the member holds, and the launch URL", async () => {
    await actAs(carol)
    const [application] = await getMemberApplications(orgA.id)

    expect(application.roles.map((role) => role.key)).toEqual(["editor"])
    expect(application.launchUrl).toBe("https://a.example.test")

    await actAs(alice)
    const [asOwner] = await getMemberApplications(orgA.id)
    expect(asOwner.roles).toEqual([])
  })

  test("never links to a stored address that is not a web URL", async () => {
    await actAs(bob)
    const [application] = await getMemberApplications(orgB.id)

    expect(application.clientId).toBe(clientIds.b)
    expect(application.launchUrl).toBeNull()
  })

  test("another organization's applications are refused", async () => {
    await actAs(carol)
    await expect(getMemberApplications(orgB.id)).rejects.toBeInstanceOf(
      ForbiddenError
    )

    await actAs(null)
    await expect(getMemberApplications(orgA.id)).rejects.toBeInstanceOf(
      UnauthorizedError
    )
  })

  test("a suspended organization's applications are refused", async () => {
    await db
      .update(organization)
      .set({ status: "suspended", statusChangedAt: now })
      .where(eq(organization.id, orgB.id))
    try {
      await actAs(bob)
      await expect(getMemberApplications(orgB.id)).rejects.toBeInstanceOf(
        ForbiddenError
      )
    } finally {
      await db
        .update(organization)
        .set({ status: "active", statusChangedAt: null })
        .where(eq(organization.id, orgB.id))
    }
  })
})

describe("your organizations", () => {
  test("lists the caller's other active memberships with their role", async () => {
    await actAs(dave)
    const organizations = await getMemberOrganizations(orgA.id)

    expect(
      organizations.map(({ id, slug, role }) => ({ id, slug, role }))
    ).toEqual([{ id: orgB.id, slug: orgB.slug, role: "admin" }])
  })

  test("leaves out an organization that is suspended", async () => {
    await db
      .update(organization)
      .set({ status: "suspended", statusChangedAt: now })
      .where(eq(organization.id, orgB.id))
    try {
      await actAs(dave)
      expect(await getMemberOrganizations(orgA.id)).toEqual([])
    } finally {
      await db
        .update(organization)
        .set({ status: "active", statusChangedAt: null })
        .where(eq(organization.id, orgB.id))
    }
  })

  test("never lists an organization the caller does not belong to", async () => {
    await actAs(carol)
    const organizations = await getMemberOrganizations(orgA.id)

    expect(organizations.map((entry) => entry.id)).not.toContain(orgB.id)
  })
})

describe("organization administration", () => {
  test("an owner sees their organization's membership", async () => {
    await actAs(alice)
    const summary = await getMembershipSummary(orgA.id)

    // Alice, Carol and Dave.
    expect(summary.members).toBe(3)
    expect(summary.pendingInvitations).toBe(1)
    expect(summary.invitations).toEqual([
      {
        id: `test-overview-${suffix}-invite-a`,
        email: `invitee-a-${suffix}@example.test`,
        role: "admin",
        expiresAt: inAWeek.toISOString(),
      },
    ])
  })

  test("an owner sees their organization's application counts", async () => {
    await actAs(alice)
    expect(await getApplicationSummary(orgA.id)).toEqual({
      applications: 2,
      roles: 2,
    })
  })

  test("a plain member gets no administration stats or activity", async () => {
    await actAs(carol)
    await expect(getMembershipSummary(orgA.id)).rejects.toBeInstanceOf(
      ForbiddenError
    )
    await expect(getApplicationSummary(orgA.id)).rejects.toBeInstanceOf(
      ForbiddenError
    )
    expect((await getAuditLogAccess(orgA.id)).canView).toBe(false)
    await expect(
      listAuditEvents({ organizationId: orgA.id, pageSize: 10 })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  test("another organization's owner is refused", async () => {
    await actAs(bob)
    await expect(getMembershipSummary(orgA.id)).rejects.toBeInstanceOf(
      ForbiddenError
    )
    await expect(getApplicationSummary(orgA.id)).rejects.toBeInstanceOf(
      ForbiddenError
    )
    await expect(
      listAuditEvents({ organizationId: orgA.id, pageSize: 10 })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  test("recent activity holds only the organization's own events", async () => {
    await db.insert(auditEvent).values([
      {
        id: `test-overview-${suffix}-event-a`,
        action: "organization.updated",
        actorType: "user",
        actorUserId: alice.id,
        organizationId: orgA.id,
        organizationName: orgA.name,
        scope: "tenant",
        outcome: "success",
        createdAt: now,
      },
      {
        id: `test-overview-${suffix}-event-b`,
        action: "organization.updated",
        actorType: "user",
        actorUserId: bob.id,
        organizationId: orgB.id,
        organizationName: orgB.name,
        scope: "tenant",
        outcome: "success",
        createdAt: now,
      },
    ])

    await actAs(alice)
    const { events } = await listAuditEvents({
      organizationId: orgA.id,
      pageSize: 10,
    })

    expect(events.length).toBeLessThanOrEqual(10)
    expect(events.map((event) => event.id)).toContain(
      `test-overview-${suffix}-event-a`
    )
    expect(
      events.every((event) => event.organization?.id === orgA.id)
    ).toBeTrue()
  })
})

describe("instance administration", () => {
  test("a root owner sees the instance", async () => {
    await actAs(rootOwner)
    const summary = await getInstanceSummary()
    const applications = await getInstanceApplicationCounts()

    expect(summary.organizations.active).toBeGreaterThanOrEqual(3)
    expect(summary.users.total).toBeGreaterThanOrEqual(5)
    expect(summary.users.unverified).toBeGreaterThanOrEqual(0)
    expect(applications.applications).toBeGreaterThanOrEqual(3)
    expect((await getAuditLogAccess(undefined)).canView).toBe(true)
  })

  test("a tenant owner is refused the instance", async () => {
    await actAs(alice)
    await expect(getInstanceSummary()).rejects.toBeInstanceOf(ForbiddenError)
    await expect(getInstanceApplicationCounts()).rejects.toBeInstanceOf(
      ForbiddenError
    )
    await expect(listAuditEvents({ pageSize: 10 })).rejects.toBeInstanceOf(
      ForbiddenError
    )
  })

  test("the root organization's own membership is readable by its owner", async () => {
    await actAs(rootOwner)
    const summary = await getMembershipSummary(root.id)

    expect(summary.members).toBeGreaterThanOrEqual(1)
  })
})

describe("launch URL", () => {
  test("production requires an absolute https URL", () => {
    const production = createLaunchUrlSchema(tApplications, true)

    expect(production.safeParse("https://app.example.com").success).toBe(true)
    expect(production.safeParse("http://app.example.com").success).toBe(false)
    expect(production.safeParse("/relative").success).toBe(false)
    expect(production.safeParse("app.example.com").success).toBe(false)
    expect(production.safeParse("javascript:alert(1)").success).toBe(false)
    expect(
      production.safeParse("https://user:pw@app.example.com").success
    ).toBe(false)
  })

  test("development also allows http", () => {
    expect(isLaunchUrlAllowed("http://localhost:3001", false)).toBe(true)
    expect(isLaunchUrlAllowed("ftp://files.example.com", false)).toBe(false)
    expect(launchUrlOf(null)).toBeNull()
  })

  test("the application schema trims and validates it", () => {
    const base = {
      name: "App",
      redirectUris: ["https://app.example.com/callback"],
    }

    expect(
      applicationSchema.parse({ ...base, uri: " https://app.example.com " }).uri
    ).toBe("https://app.example.com")
    expect(applicationSchema.parse({ ...base, uri: null }).uri).toBeNull()
    expect(
      applicationSchema.safeParse({ ...base, uri: "data:text/html,hi" }).success
    ).toBe(false)
  })

  test("an invalid launch URL is refused before anything is written", async () => {
    await actAs(alice)
    const created = await createApplication({
      organizationId: orgA.id,
      name: `Rejected ${suffix}`,
      redirectUris: ["https://app.example.com/callback"],
      uri: "javascript:alert(1)",
    })
    const updated = await updateApplication({
      organizationId: orgA.id,
      clientId: clientIds.a,
      name: clientIds.a,
      redirectUris: ["https://app.example.test/callback"],
      uri: "not a url",
    })

    expect(created.success).toBe(false)
    expect(updated.success).toBe(false)

    const [stored] = await db
      .select({ uri: oauthClient.uri })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientIds.a))
    expect(stored.uri).toBe("https://a.example.test")

    await actAs(alice)
    expect(
      (await getMemberApplications(orgA.id)).map(
        (application) => application.name
      )
    ).not.toContain(`Rejected ${suffix}`)
  })

  test("a valid launch URL is saved, cleared, and audited", async () => {
    await actAs(alice)
    const input = {
      organizationId: orgA.id,
      clientId: clientIds.a,
      name: clientIds.a,
      redirectUris: ["https://app.example.test/callback"],
    }

    expect(
      await updateApplication({ ...input, uri: "https://launch.example.test" })
    ).toEqual({ success: true })
    expect(await storedLaunchUrl()).toBe("https://launch.example.test")

    const events = await db
      .select({ metadata: auditEvent.metadata })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.action, "application.updated"),
          eq(auditEvent.targetId, clientIds.a)
        )
      )
    expect(events.map((event) => event.metadata?.launchUrl)).toContain(
      "https://launch.example.test"
    )

    expect(await updateApplication({ ...input, uri: null })).toEqual({
      success: true,
    })
    expect(await storedLaunchUrl()).toBeNull()
  })
})

async function storedLaunchUrl() {
  const [stored] = await db
    .select({ uri: oauthClient.uri })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientIds.a))

  return stored?.uri ?? null
}
