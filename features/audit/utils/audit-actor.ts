import type { AuditActor } from "@/features/audit/types"

type Actor = { id: string; name: string; email: string }

// No user is still an actor: the attempt happened, just not by anyone the
// request could name.
//
// `organizationId` is the membership whose authority was used, not the
// organization the act concerned. Someone acting for themselves passes none,
// however much the act is about an organization.
export function auditActorFromUser(
  user: Actor | null,
  organizationId?: string | null
): AuditActor {
  if (!user) return { type: "anonymous" }

  return {
    type: "user",
    userId: user.id,
    name: user.name,
    email: user.email,
    organizationId,
  }
}
