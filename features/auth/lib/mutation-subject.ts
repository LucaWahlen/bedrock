import { eq } from "drizzle-orm"

import {
  auditActorFromUser,
  recordAuditEvent,
  type AuditAction,
  type AuditEventInput,
} from "@/features/audit"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import type { AccessMembership, AccessUser } from "@/features/auth/types"
import { membershipIn, rootAdministration } from "@/features/auth/utils/access"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"

export type MutationOrganization = {
  id: string
  name: string
  slug: string
  isRoot: boolean
  status: (typeof organization.$inferSelect)["status"]
  logo: string | null
  color: string | null
  backgroundImage: string | null
  favicon: string | null
  allowPublicSignUp: boolean
  requireTwoFactor: boolean
}

type MutationDenial = (
  reason: string,
  error?: string
) => Promise<{ authorized: false; error: string }>

type MutationSubject = {
  currentUser: AccessUser
  organization: MutationOrganization
  membership: AccessMembership | null
  // Their standing in the instance, which is a scope of its own: a rule about
  // a tenant's own membership deliberately ignores it.
  rootMembership: AccessMembership | null
  // Refuses and records it against the organization, so its administrators see
  // the attempt.
  deny: MutationDenial
}

type MutationSubjectResolution =
  | { authorized: true; subject: MutationSubject }
  | { authorized: false; error: string }

type ResolveMutationSubject = {
  // Any domain, so an act on something an organization owns is refused and
  // recorded by the same guard that settles its membership.
  action: AuditAction
  organizationId: string
  deniedError: string
  // What a refusal names, since one act concerns a membership and another the
  // organization itself. Called before the organization is known too.
  target: (resolved?: MutationOrganization) => AuditEventInput["target"]
}

// Who is asking, about which organization, and how to refuse them. The rule
// itself belongs to the caller: this only settles the facts every rule needs.
export async function resolveMutationSubject({
  action,
  organizationId,
  deniedError,
  target,
}: ResolveMutationSubject): Promise<MutationSubjectResolution> {
  const access = await getAccessContext()

  // Once the organization has been read it is a fact, so a refusal is recorded
  // against it and its administrators can see the attempt. Before that it is
  // only a claim, and the event carries the subject alone.
  async function refuse(
    reason: string,
    resolved?: MutationOrganization,
    error = deniedError
  ) {
    await recordAuditEvent({
      action,
      outcome: "denied",
      actor: auditActorFromUser(access.user),
      organization: resolved && {
        id: resolved.id,
        name: resolved.name,
        slug: resolved.slug,
      },
      target: target(resolved),
      reason,
    })

    return { authorized: false as const, error }
  }

  const currentUser = access.user
  if (!currentUser) return refuse("Authentication is required")

  const [targetOrganization] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isRoot: organization.isRoot,
      status: organization.status,
      logo: organization.logo,
      color: organization.color,
      backgroundImage: organization.backgroundImage,
      favicon: organization.favicon,
      allowPublicSignUp: organization.allowPublicSignUp,
      requireTwoFactor: organization.requireTwoFactor,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  if (!targetOrganization) return refuse("Organization does not exist")

  return {
    authorized: true,
    subject: {
      currentUser,
      organization: targetOrganization,
      membership: membershipIn(access, targetOrganization.id),
      rootMembership: rootAdministration(access),
      deny: (reason, error) => refuse(reason, targetOrganization, error),
    },
  }
}
