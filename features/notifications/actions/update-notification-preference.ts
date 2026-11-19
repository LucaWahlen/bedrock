"use server"

import { and, eq, inArray } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import {
  canAccessOrganization,
  getAccessContext,
  membershipIn,
} from "@/features/auth"
import {
  isKindEmailLocked,
  isOrganizationKind,
  KIND_DEFAULTS,
} from "@/features/notifications/lib/topics"
import { createUpdateNotificationPreferenceSchema } from "@/features/notifications/schemas/preferences"
import type {
  UpdateNotificationPreferenceInput,
  UpdateNotificationPreferenceResult,
} from "@/features/notifications/types"
import { db } from "@/features/shared/lib/db/client"
import {
  notificationPreference,
  organization,
} from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

export async function updateNotificationPreference(
  input: UpdateNotificationPreferenceInput
): Promise<UpdateNotificationPreferenceResult> {
  const [t, tc] = await Promise.all([
    getTranslations("notifications"),
    getTranslations("common"),
  ])
  const parsed = createUpdateNotificationPreferenceSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        t("preferences.errors.invalidPreference"),
    }
  }

  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) return { success: false, error: tc("errors.notSignedIn") }

  const kinds = Array.from(new Set(parsed.data.kinds))
  const { channel, enabled } = parsed.data
  const targetOrgId = parsed.data.organizationId ?? null

  if (
    channel === "email" &&
    !enabled &&
    kinds.some((kind) => isKindEmailLocked(kind))
  ) {
    return { success: false, error: t("preferences.errors.mandatoryEmail") }
  }

  if (targetOrgId !== null) {
    if (kinds.some((kind) => !isOrganizationKind(kind))) {
      return {
        success: false,
        error: t("preferences.errors.organizationKindOnly"),
      }
    }
    const membership = membershipIn(access, targetOrgId)
    if (!membership || !canAccessOrganization(membership)) {
      return {
        success: false,
        error: t("preferences.errors.organizationDenied"),
      }
    }
  }

  try {
    const allowed = await db.transaction(async (tx) => {
      if (targetOrgId !== null) {
        const [activeOrg] = await tx
          .select({ id: organization.id })
          .from(organization)
          .where(
            and(
              eq(organization.id, targetOrgId),
              eq(organization.status, "active")
            )
          )
          .limit(1)
        if (!activeOrg) return false
      }

      const existingRows = await tx
        .select({
          id: notificationPreference.id,
          organizationId: notificationPreference.organizationId,
          kind: notificationPreference.kind,
          email: notificationPreference.email,
          inApp: notificationPreference.inApp,
        })
        .from(notificationPreference)
        .where(
          and(
            eq(notificationPreference.userId, currentUser.id),
            inArray(notificationPreference.kind, kinds)
          )
        )
        .for("update")

      const now = new Date()

      if (targetOrgId === null) {
        if (
          !parsed.data.replaceOverrides &&
          existingRows.some(
            (row) => row.organizationId !== null && row[channel] !== null
          )
        )
          return "confirm"

        for (const kind of kinds) {
          const defaults = KIND_DEFAULTS[kind]
          const defaultVal =
            channel === "email"
              ? isKindEmailLocked(kind)
                ? true
                : defaults.email
              : defaults.inApp
          const nextChannelOverride = enabled === defaultVal ? null : enabled

          const globalRow = existingRows.find(
            (row) => row.organizationId === null && row.kind === kind
          )
          const nextEmail =
            channel === "email"
              ? nextChannelOverride
              : (globalRow?.email ?? null)
          const nextInApp =
            channel === "inApp"
              ? nextChannelOverride
              : (globalRow?.inApp ?? null)

          if (nextEmail === null && nextInApp === null) {
            if (globalRow) {
              await tx
                .delete(notificationPreference)
                .where(eq(notificationPreference.id, globalRow.id))
            }
          } else if (globalRow) {
            await tx
              .update(notificationPreference)
              .set({ email: nextEmail, inApp: nextInApp, updatedAt: now })
              .where(eq(notificationPreference.id, globalRow.id))
          } else {
            await tx.insert(notificationPreference).values({
              id: crypto.randomUUID(),
              userId: currentUser.id,
              organizationId: null,
              kind,
              email: nextEmail,
              inApp: nextInApp,
              updatedAt: now,
            })
          }

          // Setting the global preference clears per-organization overrides on
          // that channel so "All organizations" applies everywhere immediately.
          if (isOrganizationKind(kind)) {
            const orgRows = existingRows.filter(
              (row) => row.organizationId !== null && row.kind === kind
            )
            for (const orgRow of orgRows) {
              const remainingEmail = channel === "email" ? null : orgRow.email
              const remainingInApp = channel === "inApp" ? null : orgRow.inApp

              if (remainingEmail === null && remainingInApp === null) {
                await tx
                  .delete(notificationPreference)
                  .where(eq(notificationPreference.id, orgRow.id))
              } else {
                await tx
                  .update(notificationPreference)
                  .set({
                    email: remainingEmail,
                    inApp: remainingInApp,
                    updatedAt: now,
                  })
                  .where(eq(notificationPreference.id, orgRow.id))
              }
            }
          }
        }

        return true
      }

      for (const kind of kinds) {
        const defaults = KIND_DEFAULTS[kind]
        const globalRow = existingRows.find(
          (row) => row.organizationId === null && row.kind === kind
        )
        const orgRow = existingRows.find(
          (row) => row.organizationId === targetOrgId && row.kind === kind
        )

        const globalEffective =
          channel === "email"
            ? isKindEmailLocked(kind)
              ? true
              : (globalRow?.email ?? defaults.email)
            : (globalRow?.inApp ?? defaults.inApp)
        const nextChannelOverride = enabled === globalEffective ? null : enabled

        const nextEmail =
          channel === "email" ? nextChannelOverride : (orgRow?.email ?? null)
        const nextInApp =
          channel === "inApp" ? nextChannelOverride : (orgRow?.inApp ?? null)

        if (nextEmail === null && nextInApp === null) {
          if (orgRow) {
            await tx
              .delete(notificationPreference)
              .where(eq(notificationPreference.id, orgRow.id))
          }
        } else if (orgRow) {
          await tx
            .update(notificationPreference)
            .set({ email: nextEmail, inApp: nextInApp, updatedAt: now })
            .where(eq(notificationPreference.id, orgRow.id))
        } else {
          await tx.insert(notificationPreference).values({
            id: crypto.randomUUID(),
            userId: currentUser.id,
            organizationId: targetOrgId,
            kind,
            email: nextEmail,
            inApp: nextInApp,
            updatedAt: now,
          })
        }
      }

      return true
    })

    if (allowed === "confirm") {
      return {
        success: false,
        needsConfirmation: true,
        error: t("preferences.scope.hasOverrides"),
      }
    }
    if (!allowed) {
      return {
        success: false,
        error: t("preferences.errors.organizationDenied"),
      }
    }

    revalidateEverywhere()

    return { success: true }
  } catch (error) {
    console.error("[notifications] Preference could not be saved", error)
    return { success: false, error: t("preferences.errors.saveFailed") }
  }
}
