"use server"

import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { z } from "zod"

import { getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { notification } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

const markNotificationReadSchema = z.object({
  id: z.string().min(1),
  read: z.boolean().optional(),
})

export async function markNotificationRead(input: {
  id: string
  read?: boolean
}): Promise<ActionResult> {
  const [tc, tn] = await Promise.all([
    getTranslations("common"),
    getTranslations("notifications"),
  ])
  const parsed = markNotificationReadSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: tn("preferences.errors.invalidPreference"),
    }
  }

  const { user } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const read = parsed.data.read ?? true
  await db
    .update(notification)
    .set({ readAt: read ? new Date() : null })
    .where(
      and(eq(notification.id, parsed.data.id), eq(notification.userId, user.id))
    )

  revalidateEverywhere()

  return { success: true }
}
