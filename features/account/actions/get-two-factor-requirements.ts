"use server"

import { and, asc, eq, ne } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { member, organization } from "@/features/shared/lib/db/schema"

/**
 * The names of the organizations the caller belongs to that require a second
 * factor, which is what keeps them from giving up their last one. A deleted
 * organization asks nothing of anyone; a suspended one still does, since it
 * comes back with the same rule.
 */
export async function getTwoFactorRequirements(): Promise<string[]> {
  const t = await getTranslations("common")
  const { user } = await getAccessContext()
  if (!user) throw new Error(t("errors.notSignedIn"))

  const rows = await db
    .select({ name: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.userId, user.id),
        eq(organization.requireTwoFactor, true),
        ne(organization.status, "deleted")
      )
    )
    .orderBy(asc(organization.name))

  return rows.map((row) => row.name)
}
