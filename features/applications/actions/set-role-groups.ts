"use server"

import { and, eq, inArray } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import type { AssignmentRefusal } from "@/features/applications/lib/role-assignment"
import { roleGroupsSchema } from "@/features/applications/schemas/application"
import type { SetRoleGroupsInput } from "@/features/applications/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleGroup,
  group,
} from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {
  constructor(readonly reason: AssignmentRefusal) {
    super(reason)
  }
}

// Replaces the groups that grant one role, from the role's side. Every group of
// the organization is offered, so the whole set is the caller's to state.
export async function setRoleGroups(
  input: SetRoleGroupsInput
): Promise<ActionResult> {
  const t = await getTranslations("applications")
  const parsed = roleGroupsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("errors.invalidGroups") }
  }

  const { organizationId, roleId } = parsed.data
  const wanted = [...new Set(parsed.data.groupIds)]

  const authorization = await authorizeApplicationMutation({
    action: "application.role_groups_changed",
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
      // Both sides are matched inside the organization, so neither a role nor a
      // group from another tenant can be named. The composite foreign keys
      // refuse the same thing again in the database.
      const [role] = await tx
        .select({
          id: applicationRole.id,
          key: applicationRole.key,
          name: applicationRole.name,
        })
        .from(applicationRole)
        .where(
          and(
            eq(applicationRole.id, roleId),
            eq(applicationRole.organizationId, organization.id)
          )
        )
        .limit(1)

      if (!role) throw new AssignmentRefused("unknownRole")

      const owned = wanted.length
        ? await tx
            .select({ id: group.id, key: group.key })
            .from(group)
            .where(
              and(
                eq(group.organizationId, organization.id),
                inArray(group.id, wanted)
              )
            )
        : []

      if (owned.length !== wanted.length) {
        throw new AssignmentRefused("unknownGroup")
      }

      const current = await tx
        .select({ id: group.id, key: group.key })
        .from(applicationRoleGroup)
        .innerJoin(group, eq(group.id, applicationRoleGroup.groupId))
        .where(eq(applicationRoleGroup.roleId, role.id))

      const held = new Set(current.map((granting) => granting.id))
      const kept = new Set(wanted)
      const added = owned.filter((granting) => !held.has(granting.id))
      const removed = current.filter((granting) => !kept.has(granting.id))

      if (added.length === 0 && removed.length === 0) return

      if (removed.length > 0) {
        await tx.delete(applicationRoleGroup).where(
          and(
            eq(applicationRoleGroup.roleId, role.id),
            inArray(
              applicationRoleGroup.groupId,
              removed.map((granting) => granting.id)
            )
          )
        )
      }

      if (added.length > 0) {
        await tx
          .insert(applicationRoleGroup)
          .values(
            added.map((granting) => ({
              roleId: role.id,
              groupId: granting.id,
              organizationId: organization.id,
              createdAt: new Date(),
            }))
          )
          .onConflictDoNothing()
      }

      await recordAuditEvent(
        {
          action: "application.role_groups_changed",
          actor: auditActorFromUser(currentUser, organization.id),
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          target: { type: "application_role", id: role.id, label: role.name },
          metadata: {
            key: role.key,
            added: added.map((granting) => granting.key),
            removed: removed.map((granting) => granting.key),
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
