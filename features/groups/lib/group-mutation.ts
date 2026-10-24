import type { AuditAction } from "@/features/audit"
import {
  hasRole,
  ORGANIZATION_ADMIN_ROLES,
  resolveMutationSubject,
  type AccessUser,
  type MutationOrganization,
} from "@/features/auth"

type GroupAuthorization =
  | {
      authorized: true
      currentUser: AccessUser
      organization: MutationOrganization
    }
  | { authorized: false; error: string }

type AuthorizeGroupMutation = {
  action: AuditAction
  organizationId: string
  deniedError: string
  target: (organization?: MutationOrganization) => {
    type: string
    id: string
    label?: string | null
  }
}

// A group belongs to the tenant that defined it, so the rule is the tenant's
// own: its administrators, and nobody else. Root administration confers
// nothing here, and root itself has no groups to manage.
export async function authorizeGroupMutation({
  action,
  organizationId,
  deniedError,
  target,
}: AuthorizeGroupMutation): Promise<GroupAuthorization> {
  const resolution = await resolveMutationSubject({
    action,
    organizationId,
    deniedError,
    target,
  })

  if (!resolution.authorized) return resolution

  const { currentUser, organization, membership, deny } = resolution.subject

  if (organization.status !== "active") {
    return deny(`Organization is ${organization.status}`)
  }

  if (organization.isRoot) {
    return deny("The root organization has no groups")
  }

  if (!membership) {
    return deny("Not a member of this organization")
  }

  if (!hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)) {
    return deny("Role does not allow managing groups")
  }

  return { authorized: true, currentUser, organization }
}
