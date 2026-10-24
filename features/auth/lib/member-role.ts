import { sql, type SQL, type SQLWrapper } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

import {
  ORGANIZATION_ADMIN_ROLES,
  type OrganizationRole,
} from "@/features/auth/types"

// Better Auth stores a member's roles as a comma-separated list in one column.
export function hasRole(roles: string, ...allowed: OrganizationRole[]) {
  const assigned = roles.split(",")

  return allowed.some((role) => assigned.includes(role))
}

// A role the column holds but the application does not know is still shown, so
// the list is of strings rather than of `OrganizationRole`.
export function splitRoles(roles: string) {
  return roles
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean)
}

// Matching a list inside one column cannot use an index. Fine while membership
// counts are small; normalize roles into their own table before they are not.
// Takes any expression, not only a column, so it also reads a unioned result.
export function memberHasRole(column: SQLWrapper, role: OrganizationRole): SQL {
  return sql`${column} ~ ${`(^|,)${role}(,|$)`}`
}

// Whether the row administers its organization, as opposed to merely belonging
// to it. `administers` is false for a role the application does not know.
export function memberAdministers(
  column: AnyPgColumn,
  administers = true
): SQL {
  const pattern = `(^|,)(${ORGANIZATION_ADMIN_ROLES.join("|")})(,|$)`

  return administers
    ? sql`${column} ~ ${pattern}`
    : sql`${column} !~ ${pattern}`
}
