import { and, eq, type SQL } from "drizzle-orm"

import {
  auditActorFromUser,
  recordAuditEvent,
  type AuditActor,
  type OrganizationAuditAction,
} from "@/features/audit"
import {
  hasRole,
  ORGANIZATION_ADMIN_ROLES,
  resolveMutationSubject,
  type MutationOrganization,
} from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

export type OrganizationMutationContext = {
  actor: AuditActor
  // The same person as `actor`, in the shape a foreign key needs.
  actorUser: { id: string; name: string }
  organization: MutationOrganization
  // The caller's role here, so a narrower right can be rechecked without a
  // second read of the access context.
  membershipRole: string | null
}

type OrganizationMutationAuthorization =
  | { authorized: true; context: OrganizationMutationContext }
  | { authorized: false; error: string }

type AuthorizeOrganizationMutation = {
  action: OrganizationAuditAction
  organizationId: string
  // What a membership of this organization must be to act from inside it, or
  // "instance" for what only the instance administrators may do to a tenant.
  require: "administrator" | "owner" | "instance"
  // Whether administering the instance also grants this. An organization's
  // lifecycle is root's business; its name and branding are not.
  allowRoot?: boolean
  deniedError: string
}

// Who may change an organization itself, as opposed to its membership.
export async function authorizeOrganizationMutation({
  action,
  organizationId,
  require,
  allowRoot = false,
  deniedError,
}: AuthorizeOrganizationMutation): Promise<OrganizationMutationAuthorization> {
  const resolution = await resolveMutationSubject({
    action,
    organizationId,
    deniedError,
    target: (resolved) => ({
      type: "organization",
      id: organizationId,
      label: resolved?.name,
    }),
  })

  if (!resolution.authorized) return resolution

  const {
    currentUser,
    organization: targetOrganization,
    membership,
    rootMembership,
    deny,
  } = resolution.subject

  const administersFromInside =
    require !== "instance" &&
    membership !== null &&
    hasRole(
      membership.role,
      ...(require === "owner" ? (["owner"] as const) : ORGANIZATION_ADMIN_ROLES)
    )

  // An organization's lifecycle is root's business; its name and branding are
  // not, so instance standing only counts where the caller asked for it.
  const actsAsInstance =
    (allowRoot || require === "instance") && rootMembership !== null
  if (!administersFromInside && !actsAsInstance) {
    return deny(
      require === "instance"
        ? "Instance administration is required"
        : require === "owner"
          ? "Organization ownership is required"
          : "Organization administration is required"
    )
  }

  const viaRoot = !administersFromInside
  const authorityOrganizationId = viaRoot
    ? (rootMembership?.organizationId ?? null)
    : targetOrganization.id

  return {
    authorized: true,
    context: {
      actor: auditActorFromUser(currentUser, authorityOrganizationId),
      actorUser: { id: currentUser.id, name: currentUser.name },
      organization: targetOrganization,
      membershipRole: membership?.role ?? null,
    },
  }
}

type OrganizationMutation = {
  context: OrganizationMutationContext
  action: OrganizationAuditAction
  // Extra guard on the current row, so a concurrent change is never overwritten.
  expected: SQL
  set: Partial<typeof organization.$inferInsert>
  metadata?: Record<string, unknown>
  failureError: string
  failureReason: string
}

// Shared shape of every authorized organization change: update under a guard,
// audit in the same transaction, then refresh.
export async function organizationMutation({
  context,
  action,
  expected,
  set,
  metadata,
  failureError,
  failureReason,
}: OrganizationMutation): Promise<ActionResult> {
  const changes = set.status
    ? {
        ...set,
        statusChangedAt: new Date(),
        statusChangedBy: context.actorUser.id,
      }
    : set

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(organization)
      .set(changes)
      .where(and(eq(organization.id, context.organization.id), expected))
      .returning({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })

    if (!row) return null

    await recordAuditEvent(
      {
        action,
        actor: context.actor,
        organization: { id: row.id, name: row.name, slug: row.slug },
        target: { type: "organization", id: row.id, label: row.name },
        metadata,
      },
      tx
    )

    return row
  })

  if (!updated) {
    return organizationMutationFailure(
      context,
      action,
      failureReason,
      failureError
    )
  }

  revalidateEverywhere()

  return { success: true }
}

type OrganizationStatusMutation = {
  action: OrganizationAuditAction
  organizationId: string
  // Deleting is an owner's own last word, so root may join them. Suspending,
  // reactivating and restoring belong to the instance alone.
  require: "owner" | "instance"
  expected: SQL
  set: Partial<typeof organization.$inferInsert> &
    Pick<typeof organization.$inferInsert, "status">
  metadata?: Record<string, unknown>
  deniedError: string
  failureError: string
  failureReason: string
}

// The root organization has no status but active, which the database enforces
// too.
export async function organizationStatusMutation({
  action,
  organizationId,
  require,
  expected,
  set,
  metadata,
  deniedError,
  failureError,
  failureReason,
}: OrganizationStatusMutation): Promise<ActionResult> {
  const authorization = await authorizeOrganizationMutation({
    action,
    organizationId,
    require,
    allowRoot: true,
    deniedError,
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  return organizationMutation({
    context: authorization.context,
    action,
    expected: and(eq(organization.isRoot, false), expected) as SQL,
    set,
    metadata,
    failureError,
    failureReason,
  })
}

async function organizationMutationFailure(
  context: OrganizationMutationContext,
  action: OrganizationAuditAction,
  reason: string,
  error: string
): Promise<ActionResult> {
  await recordAuditEvent({
    action,
    outcome: "failure",
    actor: context.actor,
    organization: {
      id: context.organization.id,
      name: context.organization.name,
      slug: context.organization.slug,
    },
    target: { type: "organization", id: context.organization.id },
    reason,
  })

  return { success: false, error }
}
