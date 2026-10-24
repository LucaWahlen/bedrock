"use server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import {
  describeKeyed,
  replaceGroupRoles,
} from "@/features/groups/lib/group-assignment"
import { authorizeGroupMutation } from "@/features/groups/lib/group-mutation"
import { groupRolesSchema } from "@/features/groups/schemas/group"
import type { SetGroupRolesInput } from "@/features/groups/types"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {}

// Replaces the roles a group grants. The organization's roles are all listed in
// the picker, so the whole set is the caller's to state.
export async function setGroupRoles(
  input: SetGroupRolesInput
): Promise<ActionResult> {
  const parsed = groupRolesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid roles" }

  const { organizationId, groupId, roleIds } = parsed.data

  const authorization = await authorizeGroupMutation({
    action: "group.roles_changed",
    organizationId,
    deniedError: "You cannot manage groups here",
    target: () => ({ type: "group", id: groupId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  try {
    await db.transaction(async (tx) => {
      const result = await replaceGroupRoles(
        tx,
        organization.id,
        groupId,
        roleIds
      )

      if (!result.ok) throw new AssignmentRefused(result.error)
      if (result.added.length === 0 && result.removed.length === 0) return

      await recordAuditEvent(
        {
          action: "group.roles_changed",
          actor: auditActorFromUser(currentUser, organization.id),
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          target: {
            type: "group",
            id: result.group.id,
            label: result.group.name,
          },
          metadata: {
            key: result.group.key,
            added: describeKeyed(result.added),
            removed: describeKeyed(result.removed),
          },
        },
        tx
      )
    })
  } catch (error) {
    if (error instanceof AssignmentRefused) {
      return { success: false, error: error.message }
    }
    throw error
  }

  revalidateEverywhere()

  return { success: true }
}
