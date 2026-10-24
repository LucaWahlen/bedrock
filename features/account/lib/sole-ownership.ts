import { and, eq, inArray, ne } from "drizzle-orm"

import {
  soleOwnedOrganizations,
  type OwnerRow,
} from "@/features/account/utils/sole-ownership"
import { memberHasRole } from "@/features/auth"
import type { db } from "@/features/shared/lib/db/client"
import { member, organization } from "@/features/shared/lib/db/schema"

type OwnershipReader = Pick<typeof db, "select">

// Not an action: it runs on whatever connection the calling action hands it,
// so the account deletion can take the locks inside its own transaction.
//
// Every owner row of every organization the user owns is read, and with `lock`
// held until the transaction ends. Member removal and demotion lock the same
// rows, so neither they nor a second deletion can race this check into leaving
// an organization with no owner.
//
// A deleted organization does not hold an account hostage: it is gone for its
// members, and its own owners chose that. Suspended ones still count, because
// suspension is lifted and the organization comes back needing an owner.
export async function findSoleOwnedOrganizations(
  reader: OwnershipReader,
  userId: string,
  { lock = false }: { lock?: boolean } = {}
) {
  const owned = reader
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, userId), memberHasRole(member.role, "owner")))

  const query = reader
    .select({
      organizationId: member.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      userId: member.userId,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        inArray(member.organizationId, owned),
        memberHasRole(member.role, "owner"),
        ne(organization.status, "deleted")
      )
    )

  const owners: OwnerRow[] = lock
    ? await query.for("update", { of: member })
    : await query

  return soleOwnedOrganizations(owners, userId)
}
