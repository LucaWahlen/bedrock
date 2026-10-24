import { describe, expect, test } from "bun:test"

import type { AccessContext, AccessMembership } from "@/features/auth/types"
import {
  canAccessOrganization,
  isRootAdministrator,
  membershipIn,
  rootAdministration,
} from "@/features/auth/utils/access"

// Every guard is a pure function of the context one request resolved, so the
// rules can be proven here without a session or a database.

const user = {
  id: "user",
  name: "User",
  email: "user@example.test",
  emailVerified: true,
  hasSecondFactor: false,
  locale: null,
}

function membership(
  overrides: Partial<AccessMembership> = {}
): AccessMembership {
  return {
    organizationId: "tenant",
    slug: "tenant",
    isRoot: false,
    status: "active",
    role: "member",
    requireTwoFactor: false,
    ...overrides,
  }
}

function access(...memberships: AccessMembership[]): AccessContext {
  return { user, memberships }
}

const rootOwner = membership({
  organizationId: "root",
  slug: "root",
  isRoot: true,
  role: "owner",
})

describe("finding a membership", () => {
  test("returns the membership of the organization asked about", () => {
    const tenant = membership()

    expect(membershipIn(access(rootOwner, tenant), "tenant")).toBe(tenant)
  })

  // Another organization's membership answers nothing about this one, however
  // much authority it carries.
  test("is null for an organization the caller does not belong to", () => {
    expect(membershipIn(access(rootOwner), "tenant")).toBeNull()
  })

  test("is null without a session", () => {
    expect(membershipIn({ user: null, memberships: [] }, "tenant")).toBeNull()
  })
})

describe("root administration", () => {
  test.each(["owner", "admin", "member,owner"])(
    "a root %s administers the instance",
    (role) => {
      const root = membership({ ...rootOwner, role })

      expect(rootAdministration(access(root))).toBe(root)
      expect(isRootAdministrator(access(root))).toBe(true)
    }
  )

  // A tenant owner is not an instance administrator.
  test("owning a tenant grants nothing", () => {
    const tenantOwner = access(membership({ role: "owner" }))

    expect(rootAdministration(tenantOwner)).toBeNull()
    expect(isRootAdministrator(tenantOwner)).toBe(false)
  })

  test("a role root does not recognise grants nothing", () => {
    const root = access(membership({ ...rootOwner, role: "member" }))

    expect(isRootAdministrator(root)).toBe(false)
  })

  test("nobody administers without a session", () => {
    expect(isRootAdministrator({ user: null, memberships: [] })).toBe(false)
  })

  test("is found among tenant memberships", () => {
    expect(
      rootAdministration(access(membership({ role: "owner" }), rootOwner))
    ).toBe(rootOwner)
  })
})

describe("entering an organization", () => {
  test("follows the organization's status, not the caller's role", () => {
    expect(canAccessOrganization(membership({ role: "owner" }))).toBe(true)
    expect(
      canAccessOrganization(membership({ role: "owner", status: "suspended" }))
    ).toBe(false)
    expect(
      canAccessOrganization({ ...rootOwner, status: "deleted" as const })
    ).toBe(false)
  })
})
