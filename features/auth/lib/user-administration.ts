import { and, eq } from "drizzle-orm"

import {
  auditActorFromUser,
  recordAuditEvent,
  type AuditActor,
  type AuditAction,
} from "@/features/audit"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { hasRole } from "@/features/auth/lib/member-role"
import type { AccessUser } from "@/features/auth/types"
import { rootAdministration } from "@/features/auth/utils/access"
import { db } from "@/features/shared/lib/db/client"
import { member, organization, user } from "@/features/shared/lib/db/schema"

export type AdministeredUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
}

type UserAdministration =
  | {
      authorized: true
      actor: AuditActor
      currentUser: AccessUser
      target: AdministeredUser
    }
  | { authorized: false; error: string }

type AuthorizeUserAdministration = {
  action: AuditAction
  userId: string
  // Destructive acts on someone else's account are refused to a session that
  // could itself be taken with a password alone.
  requireSecondFactor: boolean
  // What the administrator is told, so a refusal they can fix names the fix.
  errors: { denied: string; secondFactor: string; rootMember: string }
}

// Whether a root administrator may support this account. Not their own, which
// they manage from their account settings, and not a root member's unless they
// are a root owner themselves: only owners change who administers the
// instance, and taking over an administrator's account would do exactly that.
export async function authorizeUserAdministration({
  action,
  userId,
  requireSecondFactor,
  errors,
}: AuthorizeUserAdministration): Promise<UserAdministration> {
  const access = await getAccessContext()
  const root = rootAdministration(access)
  const currentUser = access.user

  const [target] =
    typeof userId === "string" && userId.length > 0
      ? await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
          })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1)
      : []

  async function deny(reason: string, error = errors.denied) {
    await recordAuditEvent({
      action,
      outcome: "denied",
      actor: auditActorFromUser(currentUser, root?.organizationId ?? null),
      target: target
        ? { type: "user", id: target.id, label: target.name }
        : undefined,
      reason,
    })

    return { authorized: false as const, error }
  }

  if (!currentUser || !root) return deny("Instance administration is required")
  if (requireSecondFactor && !currentUser.hasSecondFactor) {
    return deny("A second factor is required", errors.secondFactor)
  }
  if (!target) return deny("User does not exist")
  if (target.id === currentUser.id) {
    return deny("Your own account is managed from account settings")
  }

  const [rootRole] = await db
    .select({ role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, target.id), eq(organization.isRoot, true)))
    .limit(1)
  if (rootRole && !hasRole(root.role, "owner")) {
    return deny(
      "Only a root owner may administer a root member's account",
      errors.rootMember
    )
  }

  return {
    authorized: true,
    actor: auditActorFromUser(currentUser, root.organizationId),
    currentUser,
    target,
  }
}
