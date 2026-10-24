import { getRequestConfig } from "next-intl/server"
import { cookies, headers } from "next/headers"
import { unstable_rethrow } from "next/navigation"

import { getAccessContext } from "@/features/auth"
import { isLocale, LOCALE_COOKIE } from "@/features/shared/lib/i18n/config"
import { formats } from "@/features/shared/lib/i18n/formats"
import { messagesFor } from "@/features/shared/lib/i18n/messages"
import { resolveLocale } from "@/features/shared/lib/i18n/resolve-locale"

// The signed-in person's choice. Every page renders through the root layout,
// which needs a locale, so a database fault falls back to the browser's
// language here and is left for the page itself to report.
async function preferredLocale() {
  try {
    return (await getAccessContext()).user?.locale ?? null
  } catch (error) {
    unstable_rethrow(error)
    return null
  }
}

// Resolved per request, with no locale in the URL: `user.locale`, then the
// `NEXT_LOCALE` cookie, then `Accept-Language`, then English.
export async function requestLocale() {
  const [preference, cookieStore, requestHeaders] = await Promise.all([
    preferredLocale(),
    cookies(),
    headers(),
  ])

  return resolveLocale({
    preference,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  })
}

// Wired up by the next-intl plugin in `next.config.ts`.
export default getRequestConfig(async ({ locale: override }) => {
  const locale = isLocale(override) ? override : await requestLocale()

  return { locale, messages: messagesFor(locale), formats }
})
