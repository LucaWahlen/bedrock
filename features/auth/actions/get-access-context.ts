"use server"

import { and, asc, eq, gt, lt, or, isNull, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { after } from "next/server"
import { cache } from "react"

import { auth } from "@/features/auth/lib/auth"
import type { AccessContext } from "@/features/auth/types"
import { isRootAdministrator } from "@/features/auth/utils/access"
import { db } from "@/features/shared/lib/db/client"
import {
  breakGlassGrant,
  member,
  organization,
  passkey,
  user,
} from "@/features/shared/lib/db/schema"
import { isLocale } from "@/features/shared/lib/i18n/config"

const NO_ACCESS: AccessContext = { user: null, memberships: [] }

function recordActivity(userId: string) {
  const threshold = sql`now() - interval '1 day'`

  after(async () => {
    await db
      .update(user)
      .set({ lastActiveAt: new Date() })
      .where(
        and(
          eq(user.id, userId),
          or(isNull(user.lastActiveAt), lt(user.lastActiveAt, threshold))
        )
      )
  })
}

// One session read and one membership query answer every authorization question
// in a request; `features/auth/utils/access` derives the rest without a query.
const readAccessContext = cache(async (): Promise<AccessContext> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NO_ACCESS

  const [[standing], memberships] = await Promise.all([
    db
      .select({
        disabledAt: user.disabledAt,
        twoFactorEnabled: user.twoFactorEnabled,
        locale: user.locale,
        // Bound to the id rather than the outer column: a single-table select
        // renders columns unqualified, which the subquery would resolve to its
        // own table.
        hasPasskey: sql<boolean>`exists (select 1 from ${passkey} where ${passkey.userId} = ${session.user.id})`,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    db
      .select({
        organizationId: organization.id,
        slug: organization.slug,
        isRoot: organization.isRoot,
        status: organization.status,
        role: member.role,
        requireTwoFactor: organization.requireTwoFactor,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, session.user.id))
      .orderBy(asc(organization.name)),
  ])

  // Disabling revokes every session in the same transaction, so this only
  // closes the window of a request already in flight. Either way a disabled
  // account is nobody.
  if (!standing || standing.disabledAt) return NO_ACCESS

  recordActivity(session.user.id)

  return withBreakGlass({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      emailVerified: session.user.emailVerified,
      hasSecondFactor: standing.twoFactorEnabled || standing.hasPasskey,
      locale: isLocale(standing.locale) ? standing.locale : null,
    },
    memberships,
  })
})

// A break-glass grant makes its holder an owner of the organization for as long
// as it is open, and only while they still administer the instance with a
// second factor: losing root, or the factor, ends it on the next request.
// Suspended and deleted organizations stay closed to it.
async function withBreakGlass(access: AccessContext): Promise<AccessContext> {
  if (!access.user?.hasSecondFactor || !isRootAdministrator(access)) {
    return access
  }

  const grants = await db
    .select({
      grantId: breakGlassGrant.id,
      expiresAt: breakGlassGrant.expiresAt,
      reason: breakGlassGrant.reason,
      organizationId: organization.id,
      slug: organization.slug,
      status: organization.status,
      requireTwoFactor: organization.requireTwoFactor,
    })
    .from(breakGlassGrant)
    .innerJoin(
      organization,
      eq(organization.id, breakGlassGrant.organizationId)
    )
    .where(
      and(
        eq(breakGlassGrant.userId, access.user.id),
        isNull(breakGlassGrant.endedAt),
        gt(breakGlassGrant.expiresAt, sql`now()`),
        eq(organization.status, "active"),
        eq(organization.isRoot, false)
      )
    )
  if (grants.length === 0) return access

  const memberships = [...access.memberships]
  for (const { grantId, expiresAt, reason, ...held } of grants) {
    const elevated = {
      ...held,
      isRoot: false,
      role: "owner",
      breakGlass: { grantId, expiresAt: expiresAt.toISOString(), reason },
    }
    const index = memberships.findIndex(
      (membership) => membership.organizationId === held.organizationId
    )
    if (index === -1) memberships.push(elevated)
    else memberships[index] = elevated
  }

  return { ...access, memberships }
}

export async function getAccessContext() {
  return readAccessContext()
}
