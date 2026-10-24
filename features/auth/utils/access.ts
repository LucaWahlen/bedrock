import { hasRole } from "@/features/auth/lib/member-role"
import {
  ORGANIZATION_ADMIN_ROLES,
  type AccessContext,
  type AccessMembership,
} from "@/features/auth/types"

// Pure reads of a context the server already resolved. Hiding a control is not
// authorization, so these are also what mutations recheck before they run.

// The membership a person holds, whether or not it grants anything yet. Only
// for deciding where to send them; every authorization asks `membershipIn`.
export function heldMembershipIn(
  access: AccessContext,
  organizationId: string
): AccessMembership | null {
  return (
    access.memberships.find(
      (membership) => membership.organizationId === organizationId
    ) ?? null
  )
}

// An organization that requires a second factor grants nothing to a member who
// has none, whatever their role, until they enrol one.
export function awaitsSecondFactor(
  access: AccessContext,
  membership: Pick<AccessMembership, "requireTwoFactor">
) {
  return membership.requireTwoFactor && !access.user?.hasSecondFactor
}

// The membership that authorizes acting in an organization. One held without
// the second factor the organization requires is no membership at all here, so
// every guard built on this refuses it without knowing the rule exists.
export function membershipIn(
  access: AccessContext,
  organizationId: string
): AccessMembership | null {
  const membership = heldMembershipIn(access, organizationId)

  return membership && !awaitsSecondFactor(access, membership)
    ? membership
    : null
}

// Root administration is a scope of its own: a tenant owner never inherits it.
export function rootAdministration(
  access: AccessContext
): AccessMembership | null {
  return (
    access.memberships.find(
      (membership) =>
        membership.isRoot &&
        hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES) &&
        !awaitsSecondFactor(access, membership)
    ) ?? null
  )
}

export function isRootAdministrator(access: AccessContext) {
  return rootAdministration(access) !== null
}

// Suspension is the instance's sanction and deletion is final, so neither
// leaves a way in for the organization's own administrators.
export function canAccessOrganization(membership: {
  status: AccessMembership["status"]
}) {
  return membership.status === "active"
}
