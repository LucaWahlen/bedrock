"use server"

import { and, asc, count, eq, sql } from "drizzle-orm"

import {
  canAccessOrganization,
  getAccessContext,
  hasRole,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
  splitRoles,
} from "@/features/auth"
import { primaryRole } from "@/features/organizations/lib/member-role-display"
import type { MembershipSummary } from "@/features/organizations/types"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import { invitation, member, user } from "@/features/shared/lib/db/schema"

const INVITATION_PREVIEW = 5

// One organization's membership at a glance, for the same administrators who
// may open the Members page these numbers lead to.
export async function getMembershipSummary(
  organizationId: string
): Promise<MembershipSummary> {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const membership = membershipIn(access, organizationId)
  if (
    !membership ||
    !canAccessOrganization(membership) ||
    !hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)
  ) {
    throw new ForbiddenError("You cannot view these members")
  }

  // Pending as the Members page counts it: unexpired, and not addressed to
  // someone who has since joined by another route.
  const pending = and(
    eq(invitation.organizationId, membership.organizationId),
    sql`${invitation.expiresAt} > now()`,
    sql`not exists (
      select 1 from ${member}
      join ${user} on ${user.id} = ${member.userId}
      where ${member.organizationId} = ${invitation.organizationId}
        and lower(${user.email}) = ${invitation.email}
    )`
  )

  const [[members], [invitations], preview] = await Promise.all([
    db
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, membership.organizationId)),
    db.select({ count: count() }).from(invitation).where(pending),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(pending)
      .orderBy(asc(invitation.expiresAt), asc(invitation.id))
      .limit(INVITATION_PREVIEW),
  ])

  return {
    members: members?.count ?? 0,
    pendingInvitations: invitations?.count ?? 0,
    invitations: preview.map((row) => ({
      id: row.id,
      email: row.email,
      role: primaryRole(splitRoles(row.role ?? "member")),
      expiresAt: row.expiresAt.toISOString(),
    })),
  }
}
