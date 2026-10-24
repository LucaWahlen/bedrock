import { and, eq, sql } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  group,
  groupMember,
  member,
  oauthClient,
  organization,
  passkey,
  user,
} from "@/features/shared/lib/db/schema"
import { roleGrantsIn } from "@/features/shared/lib/role-grants"

// Namespaced claim names live with the provider configuration in
// `features/auth/lib/auth.ts`, which is what emits them.
export type ApplicationAccess = {
  organizationId: string
  organizationSlug: string
  organizationName: string
  // Held directly or through a group, and only those linked to this client.
  roles: string[]
  // Keys of every group the member is in within the owning organization.
  groups: string[]
}

export type AuthorizationRefusal =
  | { reason: "unknown_application" }
  | { reason: "inactive_organization" }
  | { reason: "account_disabled" }
  | { reason: "not_member"; organizationSlug: string }
  // A member of an organization that requires a second factor, without one.
  | { reason: "second_factor_required"; organizationSlug: string }

async function findApplicationOwner(userId: string, clientId: string) {
  const [owner] = await db
    .select({
      organizationId: organization.id,
      organizationSlug: organization.slug,
      organizationName: organization.name,
      organizationStatus: organization.status,
      requireTwoFactor: organization.requireTwoFactor,
      memberId: member.id,
      userDisabledAt: user.disabledAt,
      // Compliance is read now, never carried over from when the session began.
      hasSecondFactor: sql<boolean>`coalesce(${user.twoFactorEnabled}, false) or exists (select 1 from ${passkey} where ${passkey.userId} = ${userId})`,
    })
    .from(oauthClient)
    .innerJoin(organization, eq(organization.id, oauthClient.referenceId))
    .leftJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, userId))
    )
    .leftJoin(user, eq(user.id, userId))
    .where(eq(oauthClient.clientId, clientId))
    .limit(1)

  return owner ?? null
}

type ApplicationOwner = NonNullable<
  Awaited<ReturnType<typeof findApplicationOwner>>
>

// Who the application's organization refuses, and why, in the order a person
// would have to fix it. Shared by the authorize gate and the claim callbacks,
// so a code is never issued to someone a token would be refused to.
function refusalFor(owner: ApplicationOwner): AuthorizationRefusal | null {
  // A suspended or deleted organization cannot be entered by anyone, including
  // its owners, so it cannot vouch for anyone either.
  if (owner.organizationStatus !== "active") {
    return { reason: "inactive_organization" }
  }
  if (owner.userDisabledAt) return { reason: "account_disabled" }
  // Root administration is deliberately absent from this check. Running the
  // instance is not membership of a tenant, and must not become one in a token.
  if (!owner.memberId) {
    return { reason: "not_member", organizationSlug: owner.organizationSlug }
  }
  if (owner.requireTwoFactor && !owner.hasSecondFactor) {
    return {
      reason: "second_factor_required",
      organizationSlug: owner.organizationSlug,
    }
  }

  return null
}

// The same rule as `resolveApplicationAccess`, asked before a code is issued so
// the refusal can be shown to the person rather than thrown at the application.
export async function authorizationRefusal(
  userId: string,
  clientId: string
): Promise<AuthorizationRefusal | null> {
  const owner = await findApplicationOwner(userId, clientId)

  if (!owner) return { reason: "unknown_application" }

  return refusalFor(owner)
}

const REFUSAL_ERRORS: Record<AuthorizationRefusal["reason"], string> = {
  unknown_application: "Application is not registered to an organization",
  inactive_organization: "Organization is not active",
  account_disabled: "Account is disabled",
  not_member: "Not a member of the organization owning this application",
  second_factor_required:
    "The organization owning this application requires a second factor",
}

// Whether this person may receive a token for this application at all, and what
// it says about them. A live session is not an answer: the token belongs to the
// organization that owns the application, so the membership is rechecked here
// and a refusal is a thrown error, which stops the token being issued.
export async function resolveApplicationAccess(
  userId: string,
  clientId: string
): Promise<ApplicationAccess> {
  const owner = await findApplicationOwner(userId, clientId)

  if (!owner) throw new Error(REFUSAL_ERRORS.unknown_application)

  const refusal = refusalFor(owner)
  if (refusal) throw new Error(REFUSAL_ERRORS[refusal.reason])
  // Narrowed for the compiler; `refusalFor` has already refused without one.
  if (!owner.memberId) throw new Error(REFUSAL_ERRORS.not_member)

  // A role reaches the token held directly or through one of the member's
  // groups, the same effective set the members table shows, and either way only
  // when it is linked to this client. Every join stays inside the owning
  // organization, and both paths hang off the membership, so leaving the
  // organization takes all of it away.
  const grants = roleGrantsIn(owner.organizationId)
  const [roles, groups] = await Promise.all([
    db
      .selectDistinct({ key: applicationRole.key })
      .from(grants)
      .innerJoin(applicationRole, eq(applicationRole.id, grants.roleId))
      .innerJoin(
        applicationRoleClient,
        eq(applicationRoleClient.roleId, applicationRole.id)
      )
      .where(
        and(
          eq(grants.memberId, owner.memberId),
          eq(applicationRoleClient.clientId, clientId),
          eq(applicationRole.organizationId, owner.organizationId)
        )
      ),
    db
      .select({ key: group.key })
      .from(groupMember)
      .innerJoin(group, eq(group.id, groupMember.groupId))
      .where(
        and(
          eq(groupMember.memberId, owner.memberId),
          eq(group.organizationId, owner.organizationId)
        )
      ),
  ])

  return {
    organizationId: owner.organizationId,
    organizationSlug: owner.organizationSlug,
    organizationName: owner.organizationName,
    roles: [...new Set(roles.map((role) => role.key))].toSorted(),
    groups: [...new Set(groups.map((held) => held.key))].toSorted(),
  }
}
