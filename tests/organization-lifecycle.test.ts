import { describe, expect, test } from "bun:test"

import { canAccessOrganization } from "@/features/auth/utils/access"
import {
  organizationPurgeCutoff,
  organizationPurgeDate,
} from "@/features/organizations/utils/organization-retention"

describe("who may enter an organization", () => {
  test("an active one lets its members in", () => {
    expect(canAccessOrganization({ status: "active" })).toBe(true)
  })

  // Suspension is the instance's sanction, so it holds against everyone the
  // organization has, owners included.
  test.each(["suspended", "deleted"] as const)(
    "a %s one lets nobody in",
    (status) => {
      expect(canAccessOrganization({ status })).toBe(false)
    }
  )
})

describe("when a deleted organization is purged", () => {
  const deletedAt = new Date("2026-01-01T12:00:00.000Z")

  test("retention is counted from the deletion", () => {
    expect(organizationPurgeDate(deletedAt, 30).toISOString()).toBe(
      "2026-01-31T12:00:00.000Z"
    )
  })

  // The date a root administrator is shown and the date housekeeping acts on
  // are the same judgement, so a row is purged exactly when its date passes.
  test("the cutoff agrees with the date that was shown", () => {
    const purgeDate = organizationPurgeDate(deletedAt, 30)

    expect(organizationPurgeCutoff(purgeDate, 30)).toEqual(deletedAt)
    expect(
      organizationPurgeCutoff(new Date(purgeDate.getTime() - 1), 30).getTime()
    ).toBeLessThan(deletedAt.getTime())
  })
})
