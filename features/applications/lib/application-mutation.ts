import type { ApplicationAuditAction } from "@/features/audit"
import {
  hasRole,
  ORGANIZATION_ADMIN_ROLES,
  resolveMutationSubject,
  type AccessUser,
  type MutationOrganization,
} from "@/features/auth"

type ApplicationAuthorization =
  | {
      authorized: true
      currentUser: AccessUser
      organization: MutationOrganization
    }
  | { authorized: false; error: string }

type AuthorizeApplicationMutation = {
  action: ApplicationAuditAction
  organizationId: string
  deniedError: string
  target: (organization?: MutationOrganization) => {
    type: string
    id: string
    label?: string | null
  }
}

// An application belongs to the tenant that registered it, so the rule is the
// tenant's own: its administrators, and nobody else. Root administration is
// deliberately not an alternative here — running the instance is not the same
// as speaking for one of its organizations.
export async function authorizeApplicationMutation({
  action,
  organizationId,
  deniedError,
  target,
}: AuthorizeApplicationMutation): Promise<ApplicationAuthorization> {
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

  // The instance administers the platform; it is not a tenant with software of
  // its own to sign people in to. Refused here so it covers roles and
  // assignments too, not only registering a client.
  if (organization.isRoot) {
    return deny("The root organization does not own applications")
  }

  if (!membership) {
    return deny("Not a member of this organization")
  }

  if (!hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)) {
    return deny("Role does not allow managing applications")
  }

  return { authorized: true, currentUser, organization }
}
