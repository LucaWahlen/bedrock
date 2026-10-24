import { cookies } from "next/headers"

import { env } from "@/features/shared/lib/config/env"
import { LOCALE_COOKIE, type Locale } from "@/features/shared/lib/i18n/config"

const ONE_YEAR = 60 * 60 * 24 * 365

// Remembers this browser's language. Only a Server Action or Route Handler may
// set a cookie, so this is called from one, after the locale was validated.
export async function writeLocaleCookie(locale: Locale) {
  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: true,
    secure: new URL(env.auth.url).protocol === "https:",
  })
}
