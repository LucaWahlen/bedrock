import { describe, expect, test } from "bun:test"

import { auditActorFromUser } from "@/features/audit/utils/audit-actor"
import {
  toAuditEventDisplay,
  type AuditEventRow,
} from "@/features/audit/utils/to-audit-event-display"

// `actorOrganizationId` is the membership whose authority was used, not the
// organization the act concerned. Confusing the two makes the log claim someone
// wielded authority they did not have, which on the root organization reads as
// instance administration.

const ROOT_ORGANIZATION = "org-root"

function row(overrides: Partial<AuditEventRow> = {}): AuditEventRow {
  return {
    id: "evt-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    action: "user.created",
    outcome: "success",
    actorType: "user",
    actorUserId: "usr-new",
    recordedActorName: "Invited Person",
    recordedActorEmail: "invited@example.test",
    actorName: "Invited Person",
    actorEmail: "invited@example.test",
    actorImage: null,
    actorOrganizationId: null,
    actorOrganizationIsRoot: null,
    organizationId: ROOT_ORGANIZATION,
    recordedOrganizationName: "Bedrock",
    recordedOrganizationSlug: "bedrock",
    organizationName: "Bedrock",
    organizationSlug: "bedrock",
    organizationLogo: null,
    organizationIsRoot: true,
    targetType: "user",
    targetId: "usr-new",
    targetLabel: "Invited Person",
    reason: null,
    metadata: { via: "invitation" },
    ipAddress: "203.0.113.9",
    userAgent: null,
    ...overrides,
  }
}

describe("acting for yourself claims no authority", () => {
  // The reported bug: accepting an invitation to the root organization and
  // creating the account in the same step was marked as root administration.
  test("registering through an invitation to the root organization", () => {
    const display = toAuditEventDisplay(row(), { namesRootActors: true })

    expect(display.actor.isRootActor).toBe(false)
    expect(display.actor.name).toBe("Invited Person")
  })

  test("and the actor is named to everyone, not redacted as the platform", () => {
    const display = toAuditEventDisplay(row(), { namesRootActors: false })

    expect(display.actor.type).toBe("user")
    expect(display.actor.name).toBe("Invited Person")
    expect(display.ipAddress).toBe("203.0.113.9")
  })

  test("the helper only records an organization when one is passed", () => {
    const person = {
      id: "usr-1",
      name: "Invited Person",
      email: "invited@example.test",
    }

    expect(auditActorFromUser(person)).toMatchObject({
      type: "user",
      organizationId: undefined,
    })
    expect(auditActorFromUser(person, ROOT_ORGANIZATION)).toMatchObject({
      organizationId: ROOT_ORGANIZATION,
    })
  })
})

describe("acting with authority still says so", () => {
  // A root administrator reaching into a tenant is the case the flag exists
  // for, and it has to keep working.
  const administered = row({
    action: "organization.suspended",
    actorUserId: "usr-root-admin",
    recordedActorName: "Root Administrator",
    recordedActorEmail: "root@example.test",
    actorName: "Root Administrator",
    actorEmail: "root@example.test",
    actorOrganizationId: ROOT_ORGANIZATION,
    actorOrganizationIsRoot: true,
    organizationId: "org-acme",
    recordedOrganizationName: "Acme",
    recordedOrganizationSlug: "acme",
    organizationName: "Acme",
    organizationSlug: "acme",
    organizationIsRoot: false,
  })

  test("a root administrator is marked as one", () => {
    const display = toAuditEventDisplay(administered, {
      namesRootActors: true,
    })

    expect(display.actor.isRootActor).toBe(true)
    expect(display.actor.name).toBe("Root Administrator")
  })

  test("and is the platform, not a person, to the tenant they acted on", () => {
    const display = toAuditEventDisplay(administered, {
      namesRootActors: false,
    })

    expect(display.actor.type).toBe("system")
    expect(display.actor.name).toBeNull()
    expect(display.ipAddress).toBeNull()
  })
})
