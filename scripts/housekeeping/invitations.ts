import { lte, sql } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { invitation } from "@/features/shared/lib/db/schema"

/**
 * Removes invitations nobody took up. Expiry is already enforced when a token
 * is redeemed, so this is not what makes them unusable; it is what stops the
 * table holding the address of somebody who never joined. Who was invited, by
 * whom, and that it lapsed is recorded in the audit log.
 */
export async function housekeepInvitations() {
  const lapsed = await db
    .delete(invitation)
    .where(lte(invitation.expiresAt, sql`now()`))
    .returning({ id: invitation.id })

  return { deleted: lapsed.length }
}
