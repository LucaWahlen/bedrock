"use server"

import { getTranslations } from "next-intl/server"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import {
  replaceMemberRoles,
  type AssignmentRefusal,
} from "@/features/applications/lib/role-assignment"
import { memberRolesSchema } from "@/features/applications/schemas/application"
import type { SetMemberRolesInput } from "@/features/applications/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {
  constructor(readonly reason: AssignmentRefusal) {
    super(reason)
  }
}

// Replaces the whole set for one member, so removing a role is the same act as
// adding one and cannot be forgotten.
export async function setMemberRoles(
  input: SetMemberRolesInput
): Promise<ActionResult> {
  const t = await getTranslations("applications")
  const parsed = memberRolesSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("errors.invalidRoles") }
  }

  const { organizationId, userId, roleIds } = parsed.data

  const authorization = await authorizeApplicationMutation({
    action: "application.roles_assigned",
    organizationId,
    deniedError: t("errors.assignRolesDenied"),
    target: () => ({ type: "user", id: userId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  try {
    await db.transaction(async (tx) => {
      const result = await replaceMemberRoles(
        tx,
        organization.id,
        userId,
        roleIds
      )

      if (!result.ok) throw new AssignmentRefused(result.error)
      if (result.added.length === 0 && result.removed.length === 0) return

      await recordAuditEvent(
        {
          action: "application.roles_assigned",
          actor: auditActorFromUser(currentUser, organization.id),
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          target: {
            type: "user",
            id: result.person.userId,
            label: result.person.name,
          },
          metadata: {
            added: result.added.map((role) => role.key),
            removed: result.removed.map((role) => role.key),
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
