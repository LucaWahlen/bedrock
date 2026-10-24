import type { SoleOwnedOrganization } from "@/features/account/types"

export type OwnerRow = {
  organizationId: string
  organizationName: string
  organizationSlug: string
  userId: string
}

// Given every owner of every organization the user owns, the organizations
// where nobody else is one. Deleting the account would leave those ownerless,
// which the instance never allows.
export function soleOwnedOrganizations(
  owners: OwnerRow[],
  userId: string
): SoleOwnedOrganization[] {
  const byOrganization = new Map<
    string,
    { organization: SoleOwnedOrganization; userIds: Set<string> }
  >()

  for (const row of owners) {
    const entry = byOrganization.get(row.organizationId) ?? {
      organization: {
        id: row.organizationId,
        name: row.organizationName,
        slug: row.organizationSlug,
      },
      userIds: new Set<string>(),
    }
    entry.userIds.add(row.userId)
    byOrganization.set(row.organizationId, entry)
  }

  return [...byOrganization.values()]
    .filter(({ userIds }) => userIds.size === 1 && userIds.has(userId))
    .map(({ organization }) => organization)
    .toSorted((a, b) => a.name.localeCompare(b.name))
}
