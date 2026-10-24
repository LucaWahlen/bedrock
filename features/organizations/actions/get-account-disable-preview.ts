"use server"

import { eq } from "drizzle-orm"

import { getAccessContext, hasRole, rootAdministration } from "@/features/auth"
import {
  findSoleActiveOwnerships,
  isFinalActiveRootOwner,
  isRootOwner,
} from "@/features/organizations/lib/account-standing"
import type { AccountDisablePreview } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

// Read by the confirmation dialog before it offers to disable anyone, so the
// administrator learns which tenants would be left without an active owner.
// The action itself decides again; this only explains in advance.
export async function getAccountDisablePreview(
  userId: string
): Promise<QueryResult<AccountDisablePreview>> {
  const access = await getAccessContext()
  const membership = rootAdministration(access)
  if (!access.user || !membership) {
    return {
      success: false,
      error: "Only root administrators can change account access",
    }
  }

  const [target] = await db
    .select({ name: user.name, email: user.email, disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!target) return { success: false, error: "That user no longer exists" }

  const [soleOwnedOrganizations, finalRootOwner, rootOwner] = await Promise.all(
    [
      findSoleActiveOwnerships(db, userId),
      isFinalActiveRootOwner(db, userId),
      isRootOwner(db, userId),
    ]
  )

  const refusal =
    userId === access.user.id
      ? "You cannot disable your own account"
      : finalRootOwner
        ? "The last active owner of the root organization cannot be disabled"
        : rootOwner && !hasRole(membership.role, "owner")
          ? "Only a root owner can disable another root owner"
          : null

  return {
    success: true,
    data: {
      name: target.name,
      email: target.email,
      disabled: target.disabledAt !== null,
      soleOwnedOrganizations,
      refusal,
    },
  }
}
