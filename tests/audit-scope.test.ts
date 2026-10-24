import { describe, expect, test } from "bun:test"

import { auditScopeOf } from "@/features/audit/lib/record-audit-event"
import type { AuditEventInput } from "@/features/audit/types"

// Scope decides who can ever read an event, and it is written once and never
// recomputed, so getting it wrong is not something a later fix can undo.

const ACME = { id: "org-acme", name: "Acme", slug: "acme" }
const ROOT = { id: "org-root", name: "Bedrock", slug: "bedrock" }

function member(organizationId: string | null) {
  return {
    type: "user" as const,
    userId: "usr-1",
    name: "Member",
    email: "member@example.test",
    organizationId,
  }
}

function scope(input: AuditEventInput) {
  return auditScopeOf(input)
}

describe("an organization's own business stays inside it", () => {
  test("a membership changed by its own administrator", () => {
    expect(
      scope({
        action: "organization.member_role_changed",
        actor: member(ACME.id),
        organization: ACME,
      })
    ).toBe("tenant")
  })

  test("an invitation it sent", () => {
    expect(
      scope({
        action: "organization.member_invited",
        actor: member(ACME.id),
        organization: ACME,
      })
    ).toBe("tenant")
  })

  test("a successful sign-in to it", () => {
    expect(
      scope({
        action: "authentication.login",
        actor: member(ACME.id),
        organization: ACME,
      })
    ).toBe("tenant")
  })

  // Nobody used the organization's authority to join it, but the membership is
  // still the organization's own business rather than the instance's.
  test("a membership someone gave themselves", () => {
    expect(
      scope({
        action: "organization.member_added",
        actor: member(null),
        organization: ACME,
        metadata: { via: "self-service" },
      })
    ).toBe("tenant")
  })

  test("an invitation accepted by the person it was for", () => {
    expect(
      scope({
        action: "organization.invitation_accepted",
        actor: member(null),
        organization: ACME,
      })
    ).toBe("tenant")
  })

  // A refusal is the organization's own governance, so it does not become the
  // instance's to read merely by having failed.
  test("an attempt on it that its own guards refused", () => {
    expect(
      scope({
        action: "organization.member_removed",
        outcome: "denied",
        actor: member(ACME.id),
        organization: ACME,
      })
    ).toBe("tenant")
  })
})

describe("what the instance owns", () => {
  test("an event with no organization at all", () => {
    expect(
      scope({ action: "authentication.password_reset", actor: member(null) })
    ).toBe("platform")
  })

  test("anything the system did", () => {
    expect(
      scope({
        action: "organization.deleted",
        actor: { type: "system" },
        organization: ACME,
      })
    ).toBe("platform")
  })

  // An organization's lifecycle is the instance's business whoever acts: an
  // owner deleting it from inside is the last step of its existence, and root
  // must be able to see it to restore it.
  test("an organization deleted by its own owner", () => {
    expect(
      scope({
        action: "organization.deleted",
        actor: member(ACME.id),
        organization: ACME,
      })
    ).toBe("platform")
  })

  // Root administering a tenant is administration from outside, and must stay
  // visible to the instance and attributed to the root actor.
  test("an actor using another organization's authority", () => {
    expect(
      scope({
        action: "organization.suspended",
        actor: member(ROOT.id),
        organization: ACME,
      })
    ).toBe("platform")
  })

  test("a sign-in that was refused, whichever organization it was aimed at", () => {
    for (const outcome of ["failure", "denied"] as const) {
      expect(
        scope({
          action: "authentication.login",
          outcome,
          actor: { type: "anonymous", email: "member@example.test" },
          organization: ACME,
        })
      ).toBe("platform")
    }
  })

  // A user is one global identity that the directory lists and that may join any
  // organization, so an account coming into existence is never one tenant's
  // private business, however it was created.
  test("an account created by signing up to a tenant", () => {
    expect(
      scope({
        action: "user.created",
        actor: member(ACME.id),
        organization: ACME,
        metadata: { via: "sign-up" },
      })
    ).toBe("platform")
  })

  test("an account created by accepting a tenant's invitation", () => {
    expect(
      scope({
        action: "user.created",
        actor: member(ACME.id),
        organization: ACME,
        metadata: { via: "invitation" },
      })
    ).toBe("platform")
  })
})

// The membership that follows is a different fact from the account, and it is
// the organization's own, so the two are scoped apart rather than together.
test("signing up records one event of each scope", () => {
  const account = scope({
    action: "user.created",
    actor: member(ACME.id),
    organization: ACME,
  })
  const membership = scope({
    action: "organization.member_added",
    actor: member(ACME.id),
    organization: ACME,
  })

  expect([account, membership]).toEqual(["platform", "tenant"])
})
