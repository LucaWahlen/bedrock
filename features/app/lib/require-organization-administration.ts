import { redirect } from "next/navigation"

import {
  getAccessContext,
  hasRole,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
  type AccessMembership,
} from "@/features/auth"

// The guard every organization-administration page shares. It stands on its own
// rather than trusting the layout that already ran, and answers with the
// membership so the page can narrow a right further without reading access
// again.
export async function requireOrganizationAdministration(
  organizationId: string,
  slug: string
): Promise<AccessMembership> {
  const access = await getAccessContext()
  const membership = membershipIn(access, organizationId)
  if (!membership || !hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)) {
    redirect(`/org/${slug}/forbidden`)
  }

  return membership
}
