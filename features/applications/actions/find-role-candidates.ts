"use server"

import { and, asc, eq, ilike, or } from "drizzle-orm"

import { requireApplicationAdministration } from "@/features/applications/lib/application-read"
import type { OrganizationPerson } from "@/features/organizations"
import { db } from "@/features/shared/lib/db/client"
import { member, user } from "@/features/shared/lib/db/schema"
import { normalizeSearch } from "@/features/shared/lib/query"
import type { QueryResult } from "@/features/shared/types"

const MAX_RESULTS = 20

// Only the organization's own members can hold its roles, and its administrators
// already read that list, so searching it by name discloses nothing new.
export async function findRoleCandidates(
  search: string,
  organizationId?: string
): Promise<QueryResult<OrganizationPerson[]>> {
  if (!organizationId) {
    return { success: false, error: "You cannot assign roles here" }
  }

  try {
    await requireApplicationAdministration(
      organizationId,
      "You cannot assign roles here"
    )
  } catch {
    return { success: false, error: "You cannot assign roles here" }
  }

  const term = normalizeSearch(search)

  const people = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        term
          ? or(ilike(user.name, `%${term}%`), ilike(user.email, `%${term}%`))
          : undefined
      )
    )
    .orderBy(asc(user.name))
    .limit(MAX_RESULTS)

  return { success: true, data: people }
}
