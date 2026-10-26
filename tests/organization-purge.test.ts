import { afterAll, beforeAll, describe, expect, test } from "bun:test"

import { and, eq } from "drizzle-orm"

import { deleteOrganization } from "@/features/organizations/actions/delete-organization"
import { purgeOrganization } from "@/features/organizations/actions/purge-organization"
import { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  member,
  organization,
} from "@/features/shared/lib/db/schema"
import { createFixture, type Fixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

// Purging skips the retention period, so it is root's alone and only ever the
// second step after a deletion that could still have been undone.

let fixture: Fixture

async function exists(organizationId: string) {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
  return rows.length === 1
}

beforeAll(async () => {
  fixture = await createFixture("purge")
})

afterAll(async () => {
  await fixture.cleanup()
})

describe("purging an organization", () => {
  test("is refused while it is still active", async () => {
    await actAs(fixture.rootOwner)

    expect((await purgeOrganization(fixture.orgB.id)).success).toBe(false)
    expect(await exists(fixture.orgB.id)).toBe(true)
  })

  test("is refused to its own owner, even once deleted", async () => {
    await actAs(fixture.alice)
    expect(await deleteOrganization(fixture.orgA.id)).toEqual({
      success: true,
    })

    expect((await purgeOrganization(fixture.orgA.id)).success).toBe(false)
    expect(await exists(fixture.orgA.id)).toBe(true)
  })

  test("is refused to another tenant's owner", async () => {
    await actAs(fixture.bob)

    expect((await purgeOrganization(fixture.orgA.id)).success).toBe(false)
    expect(await exists(fixture.orgA.id)).toBe(true)
  })

  test("removes a deleted organization at once for root, and audits it", async () => {
    await actAs(fixture.rootOwner)

    expect(await purgeOrganization(fixture.orgA.id)).toEqual({
      success: true,
    })
    expect(await exists(fixture.orgA.id)).toBe(false)
    expect(
      await db
        .select()
        .from(member)
        .where(eq(member.organizationId, fixture.orgA.id))
    ).toEqual([])

    const [purged] = await db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.organizationId, fixture.orgA.id),
          eq(auditEvent.action, "organization.purged"),
          eq(auditEvent.outcome, "success")
        )
      )
    expect(purged?.actorUserId).toBe(fixture.rootOwner.id)
    expect(purged?.actorOrganizationId).toBe(fixture.root.id)
    // The statement survives the subject.
    expect(purged?.organizationName).toBe(fixture.orgA.name)
  })
})
