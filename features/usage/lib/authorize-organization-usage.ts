import {
  canAccessOrganization,
  getAccessContext,
  hasRole,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
} from "@/features/auth"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"

/**
 * The organization whose usage the caller may read: a tenant they currently
 * own or administer. Root administration grants nothing here, and root itself
 * has no tenant usage; the instance's is a read of its own.
 */
export async function authorizeOrganizationUsage(requested: string) {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const membership = membershipIn(access, requested)
  if (
    !membership ||
    membership.isRoot ||
    !canAccessOrganization(membership) ||
    !hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)
  ) {
    throw new ForbiddenError("You cannot view this organization's usage")
  }

  return membership.organizationId
}
