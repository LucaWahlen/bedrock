"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { db } from "@/features/shared/lib/db/client"
import { applicationRole } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

export async function deleteApplicationRole(
  organizationId: string,
  roleId: string
): Promise<ActionResult> {
  const t = await getTranslations("applications")
  const authorization = await authorizeApplicationMutation({
    action: "application.role_deleted",
    organizationId,
    deniedError: t("errors.deleteRoleDenied"),
    target: () => ({ type: "application_role", id: roleId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  // Scoped by organization in the delete itself, so a role id from another
  // tenant matches nothing rather than being acted on.
  const deleted = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(applicationRole)
      .where(
        and(
          eq(applicationRole.id, roleId),
          eq(applicationRole.organizationId, organization.id)
        )
      )
      .returning({ name: applicationRole.name, key: applicationRole.key })

    if (removed.length === 0) return null

    await recordAuditEvent(
      {
        action: "application.role_deleted",
        actor: auditActorFromUser(currentUser, organization.id),
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        target: {
          type: "application_role",
          id: roleId,
          label: removed[0].name,
        },
        metadata: { key: removed[0].key },
      },
      tx
    )

    return removed[0]
  })

  if (!deleted) {
    return { success: false, error: t("errors.roleNotFound") }
  }

  revalidateEverywhere()

  return { success: true }
}
