import { createFormatter } from "next-intl"

import type { Locale } from "@/features/shared/lib/i18n/config"
import { formats } from "@/features/shared/lib/i18n/formats"

/**
 * Dates and numbers in a message, in its language. Pinned to UTC: a mail is
 * read wherever its recipient happens to be, and a server has no idea where,
 * so a message that states a time also says it is UTC.
 */
export function emailFormatter(locale: Locale) {
  return createFormatter({ locale, timeZone: "UTC", formats })
}
