import {
  getAccessContext,
  hasRole,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
} from "@/features/auth"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"

// How many faces the avatar groups show before falling back to a count.
export const GROUP_MEMBER_PREVIEW = 5

// Groups are organization configuration, read by the tenant's own
// administrators. Root administration is not an alternative, and root itself
// has no groups.
export async function requireGroupAdministration(
  organizationId: string,
  cannot: string
) {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const membership = membershipIn(access, organizationId)
  if (
    !membership ||
    membership.isRoot ||
    membership.status !== "active" ||
    !hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)
  ) {
    throw new ForbiddenError(cannot)
  }

  return membership
}
