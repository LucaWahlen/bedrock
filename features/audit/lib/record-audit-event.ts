import {
  ACCOUNT_AUDIT_ACTIONS,
  AUTHENTICATION_AUDIT_ACTIONS,
  USER_AUDIT_ACTIONS,
  type AuditEventInput,
  type AuditScope,
} from "@/features/audit/types"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { auditEvent } from "@/features/shared/lib/db/schema"

// Deliberately not a Server Action: exposing the audit sink as an endpoint
// would let any client forge log entries. Callers authorize first, then write.
export type AuditWriter = Pick<typeof db, "insert">

// Imported lazily so this module also works outside a Next server, where the
// scheduler writes events with no request to describe.
async function readRequestContext() {
  try {
    const { headers } = await import("next/headers")
    const requestHeaders = await headers()
    return {
      ipAddress: clientAddress(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    }
  } catch {
    return { ipAddress: null, userAgent: null }
  }
}

const AUTHENTICATION_ACTIONS: readonly string[] = AUTHENTICATION_AUDIT_ACTIONS

// Actions whose subject belongs to the instance rather than to an organization.
const INSTANCE_SUBJECT_ACTIONS: readonly string[] = [
  ...USER_AUDIT_ACTIONS,
  ...ACCOUNT_AUDIT_ACTIONS,
]

// Scope is policy, not a caller's choice, so it cannot be forgotten or widened.
// It follows what an event is about, not merely where it happened: an
// organization's own activity never leaves it, including its failures, while
// anything the instance owns stays visible to the instance.
export function auditScopeOf(input: AuditEventInput): AuditScope {
  const actor = input.actor
  // Acting on an organization other than the one whose authority you used is
  // administration from outside, which is what root administration is.
  const actedFromOutside =
    actor.type === "user" &&
    actor.organizationId != null &&
    actor.organizationId !== input.organization?.id
  // A sign-in that did not succeed is an abuse signal about the instance, not
  // something the organization it was aimed at owns.
  const rejectedSignIn =
    (input.outcome ?? "success") !== "success" &&
    AUTHENTICATION_ACTIONS.includes(input.action)
  // A user is one global identity, listed in the directory and able to join any
  // organization, so an account coming into existence is the instance's business
  // whichever organization someone happened to sign up or be invited through.
  // The organization is still recorded on the event, so it reads it too.
  const instanceSubject = INSTANCE_SUBJECT_ACTIONS.includes(input.action)

  return !input.organization?.id ||
    actor.type === "system" ||
    actedFromOutside ||
    rejectedSignIn ||
    instanceSubject
    ? "platform"
    : "tenant"
}

export async function recordAuditEvent(
  input: AuditEventInput,
  writer: AuditWriter = db
) {
  const { ipAddress, userAgent } = await readRequestContext()
  const actor = input.actor

  await writer.insert(auditEvent).values({
    id: crypto.randomUUID(),
    action: input.action,
    outcome: input.outcome ?? "success",
    scope: auditScopeOf(input),
    actorType: actor.type,
    actorUserId: actor.type === "user" ? actor.userId : null,
    actorName: actor.name ?? null,
    actorEmail: actor.email ?? null,
    actorOrganizationId:
      actor.type === "user" ? (actor.organizationId ?? null) : null,
    organizationId: input.organization?.id ?? null,
    organizationName: input.organization?.name ?? null,
    organizationSlug: input.organization?.slug ?? null,
    targetType: input.target?.type ?? null,
    targetId: input.target?.id ?? null,
    targetLabel: input.target?.label ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    ipAddress,
    userAgent,
  })
}
