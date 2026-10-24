import {
  auditActorFromUser,
  recordAuditEvent,
  type AuditActor,
} from "@/features/audit"
import {
  getAccessContext,
  hasRole,
  requireRootAdministration,
  rootAdministration,
} from "@/features/auth"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"

type StandingAction = "user.disabled" | "user.enabled"

export type StandingAuthorization =
  | {
      authorized: true
      actor: AuditActor
      actorUserId: string
      // Root ownership is an owner's to take away, so only an owner may shut a
      // root owner out of their account.
      actorIsRootOwner: boolean
    }
  | { authorized: false; error: string }

// Disabling and enabling accounts is instance administration, rechecked from a
// current root membership on every call. A tenant role never reaches it.
export async function authorizeAccountStanding(
  action: StandingAction,
  userId: string
): Promise<StandingAuthorization> {
  let access
  try {
    access = await requireRootAdministration(
      "Only root administrators can change account access"
    )
  } catch (error) {
    if (
      !(error instanceof UnauthorizedError) &&
      !(error instanceof ForbiddenError)
    ) {
      throw error
    }

    await recordAuditEvent({
      action,
      outcome: "denied",
      actor: auditActorFromUser((await getAccessContext()).user),
      target: { type: "user", id: userId },
      reason:
        error instanceof UnauthorizedError
          ? "Authentication is required"
          : "Root administration is required",
    })

    return {
      authorized: false,
      error:
        error instanceof UnauthorizedError
          ? "You are not signed in"
          : "Only root administrators can change account access",
    }
  }

  const currentUser = access.user
  const membership = rootAdministration(access)
  if (!currentUser || !membership) {
    return {
      authorized: false,
      error: "Only root administrators can change account access",
    }
  }

  return {
    authorized: true,
    actor: auditActorFromUser(currentUser, membership.organizationId),
    actorUserId: currentUser.id,
    actorIsRootOwner: hasRole(membership.role, "owner"),
  }
}
