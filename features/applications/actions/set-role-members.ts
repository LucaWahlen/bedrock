"use server"

import { getTranslations } from "next-intl/server"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import {
  changeRoleMembers,
  describePeople,
  type AssignmentRefusal,
} from "@/features/applications/lib/role-assignment"
import { roleMembersSchema } from "@/features/applications/schemas/application"
import type { SetRoleMembersInput } from "@/features/applications/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {
  constructor(readonly reason: AssignmentRefusal) {
    super(reason)
  }
}

export async function setRoleMembers(
  input: SetRoleMembersInput
): Promise<ActionResult> {
  const t = await getTranslations("applications")
  const parsed = roleMembersSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("errors.invalidMembers") }
  }

  const { organizationId, roleId, add, remove } = parsed.data

  const authorization = await authorizeApplicationMutation({
    action: "application.role_members_changed",
    organizationId,
    deniedError: t("errors.assignRolesDenied"),
    target: () => ({ type: "application_role", id: roleId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  try {
    await db.transaction(async (tx) => {
      const result = await changeRoleMembers(tx, organization.id, roleId, {
        add,
        remove,
      })

      if (!result.ok) throw new AssignmentRefused(result.error)
      if (result.added.length === 0 && result.removed.length === 0) return

      await recordAuditEvent(
        {
          action: "application.role_members_changed",
          actor: auditActorFromUser(currentUser, organization.id),
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          target: {
            type: "application_role",
            id: result.role.id,
            label: result.role.name,
          },
          metadata: {
            key: result.role.key,
            added: describePeople(result.added),
            removed: describePeople(result.removed),
          },
        },
        tx
      )
    })
  } catch (error) {
    if (error instanceof AssignmentRefused) {
      return { success: false, error: t(`errors.${error.reason}`) }
    }
    throw error
  }

  revalidateEverywhere()

  return { success: true }
}
