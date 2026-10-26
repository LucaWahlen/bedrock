"use server"

import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import {
  type AssignmentRefusal,
  changeGroupMembers,
  describePeople,
} from "@/features/groups/lib/group-assignment"
import { authorizeGroupMutation } from "@/features/groups/lib/group-mutation"
import { groupMembersSchema } from "@/features/groups/schemas/group"
import type { SetGroupMembersInput } from "@/features/groups/types"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {
  constructor(readonly reason: AssignmentRefusal) {
    super(reason)
  }
}

export async function setGroupMembers(
  input: SetGroupMembersInput
): Promise<ActionResult> {
  const t = await getTranslations("groups")
  const parsed = groupMembersSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("errors.invalidMembers") }
  }

  const { organizationId, groupId, add, remove } = parsed.data

  const authorization = await authorizeGroupMutation({
    action: "group.members_changed",
    organizationId,
    deniedError: t("errors.manageDenied"),
    target: () => ({ type: "group", id: groupId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  try {
    await db.transaction(async (tx) => {
      const result = await changeGroupMembers(tx, organization.id, groupId, {
        add,
        remove,
      })

      if (!result.ok) throw new AssignmentRefused(result.error)
      if (result.added.length === 0 && result.removed.length === 0) return

      await recordAuditEvent(
        {
          action: "group.members_changed",
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
