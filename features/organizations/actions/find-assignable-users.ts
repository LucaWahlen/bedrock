"use server"

import { and, asc, desc, eq, ilike, ne, notInArray, or, sql } from "drizzle-orm"

import {
  getAccessContext,
  hasRole,
  isRootAdministrator,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
} from "@/features/auth"
import type { OrganizationPerson } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { member, user } from "@/features/shared/lib/db/schema"
import { normalizeSearch } from "@/features/shared/lib/query"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { QueryResult } from "@/features/shared/types"

// The popup scrolls, but the list stays a suggestion rather than the directory.
const MAX_RESULTS = 20

// Typing debounces, so picking several people costs a handful of lookups. The
// tighter limit is on exact-address lookups, since each one is a guess at
// whether an account exists.
const DIRECTORY_LIMIT = { window: 15 * 60, max: 200 }

const ADDRESS_LIMIT = { window: 15 * 60, max: 60 }

// Who a caller may pick as a member or an owner. A root administrator already
// reads the whole directory, so they search it by name or address. Anyone else
// only administers their own organization and must name an address exactly,
// which lets them add a colleague they know without enumerating the directory.
export async function findAssignableUsers(
  search: string,
  organizationId?: string
): Promise<QueryResult<OrganizationPerson[]>> {
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) {
    return { success: false, error: "Sign in to look anyone up" }
  }

  const searchesDirectory = isRootAdministrator(access)
  const denied = organizationId
    ? "You cannot add members to this organization"
    : "You cannot choose an owner"

  if (organizationId) {
    // A membership proves the organization exists, so nothing else has to be
    // read to know whether it may be administered.
    const membership = membershipIn(access, organizationId)
    const administersFromInside =
      membership !== null &&
      hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)

    if (!administersFromInside) return { success: false, error: denied }
  } else if (!searchesDirectory) {
    // No organization means choosing an owner for one that does not exist yet,
    // which only a root administrator ever does.
    return { success: false, error: denied }
  }

  const term = normalizeSearch(search)

  // Without a query there is nothing to suggest to someone who may not read the
  // directory, so they see nothing until they name an address.
  if (!term && !searchesDirectory) return { success: true, data: [] }

  const decision = await consumeRateLimit(
    `assignable-users:${currentUser.id}`,
    searchesDirectory ? DIRECTORY_LIMIT : ADDRESS_LIMIT
  )
  if (!decision.allowed) {
    return {
      success: false,
      error: `Too many lookups. Try again in ${Math.ceil((decision.retryAfter ?? 60) / 60)} minutes.`,
    }
  }

  const matches = !term
    ? undefined
    : searchesDirectory
      ? or(ilike(user.name, `%${term}%`), ilike(user.email, `%${term}%`))
      : eq(sql`lower(${user.email})`, term.toLowerCase())

  const people = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(user)
    .where(
      and(
        matches,
        organizationId
          ? and(
              // Adding yourself is refused, so it is never offered.
              ne(user.id, currentUser.id),
              notInArray(
                user.id,
                db
                  .select({ userId: member.userId })
                  .from(member)
                  .where(eq(member.organizationId, organizationId))
              )
            )
          : undefined
      )
    )
    // Choosing owners usually starts with yourself, so you come first there.
    .orderBy(
      ...(organizationId
        ? [asc(user.name)]
        : [desc(eq(user.id, currentUser.id)), asc(user.name)])
    )
    .limit(MAX_RESULTS)

  return { success: true, data: people }
}
