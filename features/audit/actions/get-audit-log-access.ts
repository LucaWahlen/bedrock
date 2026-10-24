"use server"

import type { AuditLogAccess } from "@/features/audit/types"
import {
  getAccessContext,
  hasRole,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
  rootAdministration,
} from "@/features/auth"

// Single source for who may read a log. An organization's own log is readable
// only from inside it; root administration is a different scope and never
// substitutes for membership. What a root administrator reads instead is the
// instance: platform events, plus the root organization's own log.
export async function getAuditLogAccess(
  organizationId?: string
): Promise<AuditLogAccess> {
  const access = await getAccessContext()
  const isRootAdministrator = rootAdministration(access) !== null

  if (!organizationId) {
    return { canView: isRootAdministrator, isRootAdministrator }
  }

  const membership = membershipIn(access, organizationId)

  return {
    canView:
      membership !== null &&
      hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES),
    isRootAdministrator,
  }
}
