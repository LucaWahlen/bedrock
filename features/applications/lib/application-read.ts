import {
  hasRole,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
} from "@/features/auth"
import { getAccessContext } from "@/features/auth"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"

// How many faces the avatar groups show before falling back to a count.
export const ROLE_MEMBER_PREVIEW = 5

// Applications and the roles over them are organization configuration, so both
// reads answer to the same rule as the pages that show them.
export async function requireApplicationAdministration(
  organizationId: string,
  cannot: string
) {
  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const membership = membershipIn(access, organizationId)
  if (
    !membership ||
    membership.status !== "active" ||
    !hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)
  ) {
    throw new ForbiddenError(cannot)
  }

  return membership
}
