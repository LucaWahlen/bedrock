import type { SignInDecision, SignInStanding } from "@/features/auth/types"
import { canAccessOrganization } from "@/features/auth/utils/access"
import type { organizationStatus } from "@/features/shared/lib/db/schema"

/**
 * Whether a person who has just proven who they are may enter the organization
 * they signed in to. Every way of signing in ends here, so a password, a second
 * factor and a passkey all get the same answer.
 */
export function decideSignIn(
  standing: SignInStanding,
  organization: { status: (typeof organizationStatus.enumValues)[number] }
): SignInDecision {
  // Being invited is precisely what makes someone a member, so refusing them
  // for not being one yet would strand the person the invitation was for. Not
  // accepted here: joining is theirs to choose, on a page that says who invited
  // them and as what.
  if (!standing.isMember && standing.isInvited) {
    return { allowed: true, next: "invitation", pendingInvitation: true }
  }

  if (!standing.isMember) {
    return {
      allowed: false,
      reason: "You are not a member of this organization",
      refusal: "notMember",
    }
  }

  if (!canAccessOrganization({ status: organization.status })) {
    return {
      allowed: false,
      reason: "This organization is suspended",
      refusal: "organizationSuspended",
    }
  }

  return { allowed: true, next: "organization", pendingInvitation: false }
}
