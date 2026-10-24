import { and, eq, inArray, sql } from "drizzle-orm"

import { normalizeEmails } from "@/features/organizations/lib/email-normalization"
import { invitation } from "@/features/shared/lib/db/schema"

type InvitationWriter = Pick<
  typeof import("@/features/shared/lib/db/client").db,
  "delete"
>

/**
 * Being let into an organization settles any invitation to it, whichever route
 * brought them in. Left behind, a token outlives the membership it asked for
 * and becomes redeemable again the moment that membership is removed.
 *
 * Returns who sent the invitations it settled.
 */
export async function settleInvitationsFor(
  writer: InvitationWriter,
  organizationId: string,
  emails: string[]
) {
  const addresses = normalizeEmails(emails)

  if (addresses.length === 0) return []

  return writer
    .delete(invitation)
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        inArray(sql`lower(${invitation.email})`, addresses)
      )
    )
    .returning({ inviterId: invitation.inviterId })
}
