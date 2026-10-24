import type { AppCapability } from "@/features/app/types"
import { getAuditLogAccess } from "@/features/audit"
import {
  hasRole,
  isRootAdministrator,
  ORGANIZATION_ADMIN_ROLES,
  type AccessContext,
  type AccessMembership,
} from "@/features/auth"

// Derived from the same server-side facts each page checks for itself, so the
// navigation never offers what the page would refuse. Plain members get the
// overview and nothing else.
export async function appCapabilities(
  access: AccessContext,
  membership: AccessMembership
): Promise<AppCapability[]> {
  const capabilities: AppCapability[] = ["overview"]

  if (hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)) {
    capabilities.push("manageOrganization")
    if (!membership.isRoot) capabilities.push("manageAuthentication")
  }

  // Root's log is the instance's, which only root administration may read.
  const auditLog = await getAuditLogAccess(
    membership.isRoot ? undefined : membership.organizationId
  )
  if (auditLog.canView) capabilities.push("viewAuditLog")

  if (membership.isRoot && isRootAdministrator(access)) {
    capabilities.push("administerInstance")
  }

  return capabilities
}
