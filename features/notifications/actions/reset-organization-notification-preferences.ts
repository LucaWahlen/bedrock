"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { z } from "zod"

import { getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { notificationPreference } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

const resetScopeSchema = z.string().min(1).nullable().optional()

/**
 * Resets notification preferences to their defaults. Passing an `organizationId`
 * clears only that organization's overrides so it inherits "All organizations"
 * again; omitting or passing `null` clears every saved preference on the account
 * (both global changes and per-organization overrides) back to factory defaults.
 */
export async function resetOrganizationNotificationPreferences(
  organizationId?: string | null
): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("notifications"),
    getTranslations("common"),
  ])
  const parsed = resetScopeSchema.safeParse(organizationId)
  if (!parsed.success) {
    return {
      success: false,
      error: t("preferences.errors.invalidPreference"),
    }
  }

  const { user } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const targetOrgId = parsed.data ?? null
  await db
    .delete(notificationPreference)
    .where(
      targetOrgId
        ? and(
            eq(notificationPreference.userId, user.id),
            eq(notificationPreference.organizationId, targetOrgId)
          )
        : eq(notificationPreference.userId, user.id)
    )

  revalidateEverywhere()

  return { success: true }
}
