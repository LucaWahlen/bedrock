"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import { isLocale, type Locale } from "@/features/shared/lib/i18n/config"
import { writeLocaleCookie } from "@/features/shared/lib/i18n/locale-cookie"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// Remembered on the account, so it follows the person to every browser and
// decides the language of the mail they are sent. The cookie keeps the sign-in
// pages in the same language once they sign out.
export async function setLocale(locale: Locale): Promise<ActionResult> {
  const t = await getTranslations("common")

  if (!isLocale(locale)) {
    return { success: false, error: t("language.changeFailed") }
  }

  const { user: currentUser } = await getAccessContext()
  if (!currentUser) return { success: false, error: t("errors.notSignedIn") }

  await db.update(user).set({ locale }).where(eq(user.id, currentUser.id))
  await writeLocaleCookie(locale)
  revalidateEverywhere()

  return { success: true }
}
