import type {
  AuditActorType,
  AuditEventDisplay,
  AuditOutcome,
} from "@/features/audit/types"

export type AuditEventRow = {
  id: string
  createdAt: Date
  action: string
  outcome: AuditOutcome
  actorType: AuditActorType
  actorUserId: string | null
  recordedActorName: string | null
  recordedActorEmail: string | null
  actorName: string | null
  actorEmail: string | null
  actorImage: string | null
  actorOrganizationId: string | null
  actorOrganizationIsRoot: boolean | null
  organizationId: string | null
  recordedOrganizationName: string | null
  recordedOrganizationSlug: string | null
  organizationName: string | null
  organizationSlug: string | null
  organizationLogo: string | null
  organizationIsRoot: boolean | null
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
}

// An event states what was true when it happened, so the recorded copy is the
// statement and the joined row is only the subject as it stands now. The two
// never substitute for each other; falling back is for rows written before
// those columns existed.
export function toAuditEventDisplay(
  row: AuditEventRow,
  { namesRootActors }: { namesRootActors: boolean }
): AuditEventDisplay {
  // Someone who used another organization's authority acted as the platform.
  // Only a root administrator is entitled to know which person that was.
  const actedFromOutside =
    row.actorOrganizationId !== null &&
    row.actorOrganizationId !== row.organizationId
  const currentActor =
    row.actorName === null
      ? null
      : {
          name: row.actorName,
          email: row.actorEmail ?? "",
          image: row.actorImage,
        }
  const currentOrganization =
    row.organizationName === null
      ? null
      : {
          name: row.organizationName,
          slug: row.organizationSlug,
          logo: row.organizationLogo,
          isRoot: row.organizationIsRoot === true,
        }
  const organizationName = row.recordedOrganizationName ?? row.organizationName
  const redactPlatformActor = actedFromOutside && !namesRootActors
  const actor: AuditEventDisplay["actor"] = redactPlatformActor
    ? {
        type: "system",
        id: null,
        name: null,
        email: null,
        current: null,
        isRootActor: true,
        isDeleted: false,
      }
    : {
        type: row.actorType,
        id: row.actorUserId,
        name: row.recordedActorName ?? row.actorName,
        email: row.recordedActorEmail ?? row.actorEmail,
        current: currentActor,
        isRootActor: row.actorOrganizationIsRoot === true,
        // The reference outlives the user, so an unresolved one proves deletion.
        isDeleted: row.actorUserId !== null && currentActor === null,
      }

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    action: row.action,
    outcome: row.outcome,
    actor,
    organization: organizationName
      ? {
          id: row.organizationId,
          name: organizationName,
          slug: row.recordedOrganizationSlug ?? row.organizationSlug,
          current: currentOrganization,
          isDeleted: currentOrganization === null,
        }
      : null,
    targetType: row.targetType,
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    reason: row.reason,
    metadata: row.metadata ?? null,
    ipAddress: redactPlatformActor ? null : row.ipAddress,
    userAgent: redactPlatformActor ? null : row.userAgent,
  }
}
