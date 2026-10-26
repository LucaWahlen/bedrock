"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import {
  type AssignmentRefusal,
  changeGroupMembers,
  describeKeyed,
  describePeople,
  replaceGroupRoles,
} from "@/features/groups/lib/group-assignment"
import { authorizeGroupMutation } from "@/features/groups/lib/group-mutation"
import { createGroupSchema } from "@/features/groups/schemas/group"
import type { GroupInput } from "@/features/groups/types"
import { db } from "@/features/shared/lib/db/client"
import { group } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {
  constructor(readonly reason: AssignmentRefusal) {
    super(reason)
  }
}

// Creates a group, or renames an existing one. The key is what applications
// match on, so an update keeps the stored one whatever the input says.
export async function saveGroup(
  input: GroupInput & { groupId?: string }
): Promise<ActionResult> {
  const t = await getTranslations("groups")
  const parsed = createGroupSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidGroup"),
    }
  }

  const memberUserIds = parsed.data.memberUserIds ?? []
  const roleIds = parsed.data.roleIds ?? []
  const editing = typeof input.groupId === "string"

  if (editing && (memberUserIds.length > 0 || roleIds.length > 0)) {
    return { success: false, error: t("errors.membersRolesSeparately") }
  }

  const action = editing ? "group.updated" : "group.created"
  const authorization = await authorizeGroupMutation({
    action,
    organizationId: parsed.data.organizationId,
    deniedError: t("errors.manageDenied"),
    target: () => ({
      type: "group",
      id: input.groupId ?? parsed.data.key,
      label: parsed.data.name,
    }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization
  const groupId = input.groupId ?? crypto.randomUUID()
  const now = new Date()

  try {
    await db.transaction(async (tx) => {
      let key = parsed.data.key
      let previousName: string | null = null

      if (editing) {
        const [existing] = await tx
          .select({ key: group.key, name: group.name })
          .from(group)
          .where(
            and(
              eq(group.id, groupId),
              eq(group.organizationId, organization.id)
            )
          )
          .limit(1)

        if (!existing) throw new AssignmentRefused("unknownGroup")

        await tx
          .update(group)
          .set({
            name: parsed.data.name,
            description: parsed.data.description ?? null,
          })
          .where(
            and(
              eq(group.id, groupId),
              eq(group.organizationId, organization.id)
            )
          )

        key = existing.key
        previousName = existing.name
      } else {
        await tx.insert(group).values({
          id: groupId,
          organizationId: organization.id,
          key: parsed.data.key,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          createdAt: now,
          updatedAt: now,
        })
      }

      const members =
        memberUserIds.length > 0
          ? await changeGroupMembers(tx, organization.id, groupId, {
              add: memberUserIds,
              remove: [],
            })
          : null
      if (members && !members.ok) throw new AssignmentRefused(members.error)

      const roles =
        roleIds.length > 0
          ? await replaceGroupRoles(tx, organization.id, groupId, roleIds)
          : null
      if (roles && !roles.ok) throw new AssignmentRefused(roles.error)

      await recordAuditEvent(
        {
          action,
          actor: auditActorFromUser(currentUser, organization.id),
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          target: { type: "group", id: groupId, label: parsed.data.name },
          metadata: {
            key,
            ...(previousName !== null &&
              previousName !== parsed.data.name && { previousName }),
            ...(members?.ok && { members: describePeople(members.added) }),
            ...(roles?.ok && { roles: describeKeyed(roles.added) }),
          },
        },
        tx
      )
    })
  } catch (error) {
    if (error instanceof AssignmentRefused) {
      return { success: false, error: t(`errors.${error.reason}`) }
    }

    const duplicate =
      error instanceof Error &&
      /group_organizationId_key_uidx/.test(
        `${error.message} ${String((error as { cause?: unknown }).cause ?? "")}`
      )

    return {
      success: false,
      error: duplicate ? t("errors.keyTaken") : t("errors.saveFailed"),
    }
  }

  revalidateEverywhere()

  return { success: true }
}
