"use server"

import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import {
  type AssignmentRefusal,
  describePeople,
  replaceMemberGroups,
} from "@/features/groups/lib/group-assignment"
import { authorizeGroupMutation } from "@/features/groups/lib/group-mutation"
import { memberGroupsSchema } from "@/features/groups/schemas/group"
import type { SetMemberGroupsInput } from "@/features/groups/types"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {
  constructor(readonly reason: AssignmentRefusal) {
    super(reason)
  }
}

// The member's side of group membership: the whole set for one person, so
// leaving a group is the same act as joining one. Each group that changed is
// audited on its own, exactly as changing it from the group's side would be.
export async function setMemberGroups(
  input: SetMemberGroupsInput
): Promise<ActionResult> {
  const t = await getTranslations("groups")
  const parsed = memberGroupsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("errors.invalidGroups") }
  }

  const { organizationId, userId, groupIds } = parsed.data

  const authorization = await authorizeGroupMutation({
    action: "group.members_changed",
    organizationId,
    deniedError: t("errors.manageDenied"),
    target: () => ({ type: "user", id: userId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  try {
    await db.transaction(async (tx) => {
      const result = await replaceMemberGroups(
        tx,
        organization.id,
        userId,
        groupIds
      )

      if (!result.ok) throw new AssignmentRefused(result.error)

      const person = describePeople([result.person])
      const changes = [
        ...result.added.map((changed) => ({
          changed,
          added: person,
          removed: [],
        })),
        ...result.removed.map((changed) => ({
          changed,
          added: [],
          removed: person,
        })),
      ]

      for (const { changed, added, removed } of changes) {
        await recordAuditEvent(
          {
            action: "group.members_changed",
            actor: auditActorFromUser(currentUser, organization.id),
            organization: {
              id: organization.id,
              name: organization.name,
              slug: organization.slug,
            },
            target: { type: "group", id: changed.id, label: changed.name },
            metadata: { key: changed.key, added, removed },
          },
          tx
        )
      }
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
