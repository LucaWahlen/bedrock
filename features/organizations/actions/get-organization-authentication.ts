"use server"

import { asc, eq, sql } from "drizzle-orm"

import {
  canAccessOrganization,
  getAccessContext,
  hasRole,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
  splitRoles,
} from "@/features/auth"
import type { OrganizationAuthentication } from "@/features/organizations/types"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import {
  member,
  organization,
  passkey,
  user,
} from "@/features/shared/lib/db/schema"

const MAX_MEMBERS = 500

// A tenant's sign-in policy and its members' second factors, for its own
// administrators. Root has no such page, and root administration grants
// nothing here: only a membership of this organization does.
export async function getOrganizationAuthentication(
  organizationId: string
): Promise<OrganizationAuthentication> {
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) throw new UnauthorizedError()

  const membership = membershipIn(access, organizationId)
  if (
    !membership ||
    membership.isRoot ||
    !canAccessOrganization(membership) ||
    !hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)
  ) {
    throw new ForbiddenError("You cannot view this organization's sign-in")
  }

  const passkeyCount =
    sql<number>`(select count(*) from ${passkey} where ${passkey.userId} = ${user.id})`
      .mapWith(Number)
      .as("passkey_count")
  const holdsSecondFactor = sql`${user.twoFactorEnabled} or exists (select 1 from ${passkey} where ${passkey.userId} = ${user.id})`

  // Every read below is scoped to the membership's own organization id, never
  // to anything the caller passed beyond proving they belong to it.
  const [[policy], rows] = await Promise.all([
    db
      .select({
        allowPublicSignUp: organization.allowPublicSignUp,
        requireTwoFactor: organization.requireTwoFactor,
      })
      .from(organization)
      .where(eq(organization.id, membership.organizationId))
      .limit(1),
    db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: member.role,
        totp: user.twoFactorEnabled,
        passkeys: passkeyCount,
        disabledAt: user.disabledAt,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, membership.organizationId))
      // Whoever still owes a second factor first, since they are who the page
      // is about.
      .orderBy(asc(holdsSecondFactor), asc(user.name), asc(user.id))
      .limit(MAX_MEMBERS),
  ])
  if (!policy) throw new ForbiddenError("You cannot view this organization")

  const [counts] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      nonCompliant:
        sql<number>`count(*) filter (where ${user.disabledAt} is null and not (${holdsSecondFactor}))`.mapWith(
          Number
        ),
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, membership.organizationId))

  const isOwner = hasRole(membership.role, "owner")

  return {
    allowPublicSignUp: policy.allowPublicSignUp,
    requireTwoFactor: policy.requireTwoFactor,
    members: rows.map(({ role, disabledAt, ...row }) => ({
      ...row,
      roles: splitRoles(role),
      disabled: disabledAt !== null,
      isSelf: row.userId === currentUser.id,
    })),
    memberCount: counts?.total ?? 0,
    nonCompliantCount: counts?.nonCompliant ?? 0,
    viewerHasSecondFactor: currentUser.hasSecondFactor,
    capabilities: {
      canChangeSignUp: true,
      canRequireTwoFactor: isOwner,
    },
  }
}
