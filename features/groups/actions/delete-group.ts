"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { authorizeGroupMutation } from "@/features/groups/lib/group-mutation"
import { db } from "@/features/shared/lib/db/client"
import { group } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// Its memberships and the roles it granted go with it by cascade, so anyone
// who held a role only through this group loses it from their next token.
export async function deleteGroup(
  organizationId: string,
  groupId: string
): Promise<ActionResult> {
  const t = await getTranslations("groups")
  if (typeof organizationId !== "string" || typeof groupId !== "string") {
    return { success: false, error: t("errors.invalid") }
  }

  const authorization = await authorizeGroupMutation({
    action: "group.deleted",
    organizationId,
    deniedError: t("errors.manageDenied"),
    target: () => ({ type: "group", id: groupId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  const deleted = await db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(group)
      .where(
        and(eq(group.id, groupId), eq(group.organizationId, organization.id))
      )
      .returning({ id: group.id, key: group.key, name: group.name })

    if (!removed) return false

    await recordAuditEvent(
      {
        action: "group.deleted",
        actor: auditActorFromUser(currentUser, organization.id),
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        target: { type: "group", id: removed.id, label: removed.name },
        metadata: { key: removed.key },
      },
      tx
    )

    return true
  })

  if (!deleted) return { success: false, error: t("errors.unknownGroup") }

  revalidateEverywhere()

  return { success: true }
}
