import {
  auditActorFromUser,
  type AuditActor,
  type OrganizationAuditAction,
} from "@/features/audit"
import {
  hasRole,
  ORGANIZATION_ADMIN_ROLES,
  resolveMutationSubject,
  type MutationOrganization,
} from "@/features/auth"

export type MemberMutationContext = {
  actor: AuditActor
  // The same person as `actor`, in the shape a foreign key needs.
  actorUser: { id: string; name: string }
  organization: MutationOrganization
  canManageOwners: boolean
}

type MemberMutationAuthorization =
  | { authorized: true; context: MemberMutationContext }
  | { authorized: false; error: string }

type AuthorizeMemberMutation = {
  action: OrganizationAuditAction
  organizationId: string
  userIds: string[]
  deniedError: string
  // What the caller may do to their own membership: step down, leave, or
  // neither. Adding yourself is refused so nobody grants themselves a
  // membership.
  selfPolicy?: "deny" | "administrators" | "anyone"
}

// Who may change a membership. Owners and admins administer their own
// organization, root or not; ownership is an owner's to grant. A membership of
// the root organization confers nothing inside a tenant.
export async function authorizeMemberMutation({
  action,
  organizationId,
  userIds,
  deniedError,
  selfPolicy = "deny",
}: AuthorizeMemberMutation): Promise<MemberMutationAuthorization> {
  const resolution = await resolveMutationSubject({
    action,
    organizationId,
    deniedError,
    target: () =>
      userIds.length === 1 ? { type: "user", id: userIds[0] } : undefined,
  })

  if (!resolution.authorized) return resolution

  const {
    currentUser,
    organization: targetOrganization,
    membership,
    deny,
  } = resolution.subject

  if (selfPolicy === "deny" && userIds.includes(currentUser.id)) {
    return deny(
      "Members cannot add themselves",
      "You cannot add yourself to an organization"
    )
  }

  const isOwner = membership !== null && hasRole(membership.role, "owner")
  const administersFromInside =
    membership !== null && hasRole(membership.role, ...ORGANIZATION_ADMIN_ROLES)
  const leaves =
    selfPolicy === "anyone" &&
    membership !== null &&
    userIds.length === 1 &&
    userIds[0] === currentUser.id

  if (!administersFromInside && !leaves) {
    return deny("Organization administration is required")
  }

  return {
    authorized: true,
    context: {
      actor: auditActorFromUser(currentUser, targetOrganization.id),
      actorUser: { id: currentUser.id, name: currentUser.name },
      organization: targetOrganization,
      canManageOwners: isOwner,
    },
  }
}
