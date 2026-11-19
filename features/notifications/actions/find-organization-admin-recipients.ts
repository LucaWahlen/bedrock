"use server"

import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm"

import { memberHasRole } from "@/features/auth"
import { requireDeliveryAuthority } from "@/features/notifications/lib/delivery-authority"
import type {
  NoticeOrganization,
  NoticeRecipient,
} from "@/features/notifications/types"
import { db } from "@/features/shared/lib/db/client"
import {
  member,
  organization,
  passkey,
  user,
} from "@/features/shared/lib/db/schema"

/**
 * Finds active owners and admins of `organizationId` (or of the root
 * organization when `root: true`), omitting disabled accounts and any IDs in
 * `excludeUserIds` so actors and inviters never receive duplicate notices.
 */
export async function findOrganizationAdminRecipients(
  authority: symbol,
  {
    organizationId,
    root = false,
    excludeUserIds = [],
  }: {
    organizationId?: string
    root?: boolean
    excludeUserIds?: string[]
  }
): Promise<{
  organization: NoticeOrganization | null
  recipients: (NoticeRecipient & { id: string })[]
}> {
  requireDeliveryAuthority(authority)
  const [targetOrg] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      color: organization.color,
    })
    .from(organization)
    .where(
      and(
        eq(organization.status, "active"),
        root
          ? eq(organization.isRoot, true)
          : eq(organization.id, organizationId ?? "")
      )
    )
    .limit(1)

  if (!targetOrg) {
    return { organization: null, recipients: [] }
  }

  const excluded = Array.from(new Set(excludeUserIds)).filter(Boolean)
  const recipients = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.organizationId, targetOrg.id),
        eq(organization.status, "active"),
        or(
          eq(organization.requireTwoFactor, false),
          eq(user.twoFactorEnabled, true),
          sql`exists (select 1 from ${passkey} where ${passkey.userId} = ${user.id})`
        ),
        or(
          memberHasRole(member.role, "owner"),
          memberHasRole(member.role, "admin")
        ),
        isNull(user.disabledAt),
        ...(excluded.length > 0 ? [notInArray(user.id, excluded)] : [])
      )
    )

  return { organization: targetOrg, recipients }
}
