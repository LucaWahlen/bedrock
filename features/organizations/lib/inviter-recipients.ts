import { and, eq, inArray } from "drizzle-orm"

import type { db } from "@/features/shared/lib/db/client"
import { member, user } from "@/features/shared/lib/db/schema"

/**
 * Whoever sent the invitations an acceptance just settled and can still be told
 * about it: their account exists and they still belong to the organization.
 * Read inside the accepting transaction, so it agrees with what was committed.
 */
export async function findInviterRecipients(
  reader: Pick<typeof db, "select">,
  organizationId: string,
  inviterIds: string[],
  inviteeId: string
) {
  const ids = Array.from(new Set(inviterIds)).filter((id) => id !== inviteeId)
  if (ids.length === 0) return []

  return reader
    .select({ name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(member.userId, ids)
      )
    )
}
