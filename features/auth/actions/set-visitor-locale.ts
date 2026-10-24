"use server"

import { getTranslations } from "next-intl/server"

import { isLocale, type Locale } from "@/features/shared/lib/i18n/config"
import { writeLocaleCookie } from "@/features/shared/lib/i18n/locale-cookie"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// The language of someone not signed in, kept in a cookie for this browser. A
// signed-in person's choice belongs on their account instead, through the
// account feature's `setLocale`, which outranks the cookie.
export async function setVisitorLocale(locale: Locale): Promise<ActionResult> {
  if (!isLocale(locale)) {
    const t = await getTranslations("common")
    return { success: false, error: t("language.changeFailed") }
  }

  await writeLocaleCookie(locale)
  revalidateEverywhere()

  return { success: true }
}
