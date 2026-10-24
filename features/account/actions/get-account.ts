"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { findSoleOwnedOrganizations } from "@/features/account/lib/sole-ownership"
import type { AccountOverview } from "@/features/account/types"
import { getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { user as userTable } from "@/features/shared/lib/db/schema"
import type { QueryResult } from "@/features/shared/types"

// Called by the account dialog when it opens, so its expected failure is a
// value. Everything here is the signed-in person's own; nothing is taken from
// the caller.
export async function getAccount(): Promise<QueryResult<AccountOverview>> {
  const t = await getTranslations("common")
  const { user } = await getAccessContext()
  if (!user) return { success: false, error: t("errors.notSignedIn") }

  const [account] = await db
    .select({ twoFactorEnabled: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1)

  return {
    success: true,
    data: {
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
      },
      soleOwnedOrganizations: await findSoleOwnedOrganizations(db, user.id),
      twoFactorEnabled: account?.twoFactorEnabled ?? false,
    },
  }
}
