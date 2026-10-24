"use server"

import { and, eq, inArray } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import {
  changeRoleMembers,
  describePeople,
} from "@/features/applications/lib/role-assignment"
import type { AssignmentRefusal } from "@/features/applications/lib/role-assignment"
import { createApplicationRoleSchema } from "@/features/applications/schemas/application"
import type { ApplicationRoleInput } from "@/features/applications/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  applicationRoleClient,
  oauthClient,
} from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

class AssignmentRefused extends Error {
  constructor(readonly reason: AssignmentRefusal) {
    super(reason)
  }
}

// Creates a role, or replaces the applications an existing one covers. A role
// is the organization's own vocabulary and may span several applications, so
// the set of applications is part of the role rather than of any one of them.
export async function saveApplicationRole(
  input: ApplicationRoleInput & { roleId?: string }
): Promise<ActionResult> {
  const t = await getTranslations("applications")
  const parsed = createApplicationRoleSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidRole"),
    }
  }

  const memberUserIds = parsed.data.memberUserIds ?? []

  if (input.roleId && memberUserIds.length > 0) {
    return { success: false, error: t("errors.roleMembersSeparately") }
  }

  const authorization = await authorizeApplicationMutation({
    action: input.roleId
      ? "application.role_updated"
      : "application.role_created",
    organizationId: input.organizationId,
    deniedError: t("errors.manageRolesDenied"),
    target: () => ({
      type: "application_role",
      id: input.roleId ?? parsed.data.key,
      label: parsed.data.name,
    }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization

  // Every application named must belong to this organization, or a role would
  // reach across tenants.
  const owned = parsed.data.clientIds.length
    ? await db
        .select({ clientId: oauthClient.clientId })
        .from(oauthClient)
        .where(
          and(
            eq(oauthClient.referenceId, organization.id),
            inArray(oauthClient.clientId, parsed.data.clientIds)
          )
        )
    : []

  if (owned.length !== parsed.data.clientIds.length) {
    return { success: false, error: t("errors.unknownApplication") }
  }

  const now = new Date()
  const roleId = input.roleId ?? crypto.randomUUID()

  try {
    await db.transaction(async (tx) => {
      // The key is immutable, so an update states the stored one, not the input.
      let key = parsed.data.key

      if (input.roleId) {
        const [updated] = await tx
          .update(applicationRole)
          .set({
            name: parsed.data.name,
            description: parsed.data.description ?? null,
          })
          .where(
            and(
              eq(applicationRole.id, input.roleId),
              eq(applicationRole.organizationId, organization.id)
            )
          )
          .returning({ key: applicationRole.key })

        if (!updated) throw new Error("Role does not exist")
        key = updated.key
      } else {
        await tx.insert(applicationRole).values({
          id: roleId,
          organizationId: organization.id,
          key: parsed.data.key,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          createdAt: now,
          updatedAt: now,
        })
      }

      await tx
        .delete(applicationRoleClient)
        .where(eq(applicationRoleClient.roleId, roleId))

      if (parsed.data.clientIds.length > 0) {
        await tx.insert(applicationRoleClient).values(
          parsed.data.clientIds.map((clientId) => ({
            roleId,
            clientId,
            createdAt: now,
          }))
        )
      }

      const assignment =
        memberUserIds.length > 0
          ? await changeRoleMembers(tx, organization.id, roleId, {
              add: memberUserIds,
              remove: [],
            })
          : null

      if (assignment && !assignment.ok) {
        throw new AssignmentRefused(assignment.error)
      }

      await recordAuditEvent(
        {
          action: input.roleId
            ? "application.role_updated"
            : "application.role_created",
          actor: auditActorFromUser(currentUser, organization.id),
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
          target: {
            type: "application_role",
            id: roleId,
            label: parsed.data.name,
          },
          metadata: {
            key,
            applications: parsed.data.clientIds,
            ...(assignment?.ok && {
              members: describePeople(assignment.added),
            }),
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
      /application_role_organizationId_key/.test(error.message)

    return {
      success: false,
      error: duplicate ? t("errors.roleKeyTaken") : t("errors.roleSaveFailed"),
    }
  }

  revalidateEverywhere()

  return { success: true }
}
