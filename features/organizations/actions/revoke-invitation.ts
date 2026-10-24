"use server"

import { and, eq } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { authorizeMemberMutation } from "@/features/organizations/lib/member-mutation"
import { db } from "@/features/shared/lib/db/client"
import { invitation } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

export async function revokeInvitation(
  organizationId: string,
  invitationId: string
): Promise<ActionResult> {
  const authorization = await authorizeMemberMutation({
    action: "organization.invitation_revoked",
    organizationId,
    userIds: [],
    deniedError: "You cannot manage invitations for this organization",
  })
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { actor, organization } = authorization.context
  const auditedOrganization = {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  }

  // Scoped to the organization the caller was authorized against, so an id
  // from elsewhere cannot be withdrawn from here. Withdrawing removes it: the
  // audit event below is the record that it happened.
  const revoked = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(invitation)
      .where(
        and(
          eq(invitation.id, invitationId),
          eq(invitation.organizationId, organization.id)
        )
      )
      .returning({ id: invitation.id, email: invitation.email })

    if (!deleted) return null

    await recordAuditEvent(
      {
        action: "organization.invitation_revoked",
        actor,
        organization: auditedOrganization,
        target: { type: "invitation", id: deleted.id, label: deleted.email },
      },
      tx
    )

    return deleted
  })

  if (!revoked) {
    const error = "That invitation is no longer open"

    await recordAuditEvent({
      action: "organization.invitation_revoked",
      outcome: "failure",
      actor,
      organization: auditedOrganization,
      target: { type: "invitation", id: invitationId },
      reason: error,
    })

    return { success: false, error }
  }

  revalidateEverywhere()

  return { success: true }
}
