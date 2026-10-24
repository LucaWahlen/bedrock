import { describe, expect, test } from "bun:test"

import { isOpenToAnyone } from "@/features/organizations/lib/join-policy"
import type { OrganizationStatus } from "@/features/organizations/types"

// The rule behind self-service membership. The sign-up form, the join action,
// the sign-up page and the 403 page all read it, so anything wrong here is
// wrong in four places at once, including two that decide rather than display.

function organization(
  overrides: Partial<{
    isRoot: boolean
    status: OrganizationStatus
    allowPublicSignUp: boolean
  }> = {}
) {
  return {
    isRoot: false,
    status: "active" as OrganizationStatus,
    allowPublicSignUp: true,
    ...overrides,
  }
}

describe("who may join without an invitation", () => {
  test("an active tenant that has opened sign-up", () => {
    expect(isOpenToAnyone(organization())).toBe(true)
  })

  test("a tenant that has not opened sign-up", () => {
    expect(isOpenToAnyone(organization({ allowPublicSignUp: false }))).toBe(
      false
    )
  })

  test.each(["suspended", "deleted"] as const)(
    "a %s organization, whatever the column says",
    (status) => {
      expect(isOpenToAnyone(organization({ status }))).toBe(false)
    }
  )

  // Administering the instance is granted, never claimed. The database enforces
  // this too, so the flag should be unreachable, but the rule is stated where
  // it is read as well as where it is written.
  test("never the root organization", () => {
    expect(isOpenToAnyone(organization({ isRoot: true }))).toBe(false)
  })
})
