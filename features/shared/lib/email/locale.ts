import { getLocale } from "next-intl/server"
import { unstable_rethrow } from "next/navigation"

import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
} from "@/features/shared/lib/i18n/config"

// The language of the request sending the mail, when there is one. Scripts
// and work outside a request have none.
async function sendingLocale() {
  try {
    return await getLocale()
  } catch (error) {
    unstable_rethrow(error)
    return null
  }
}

/**
 * The language a message is written in: the first supported preference, in
 * the order given, else the language of the request that sends it, else
 * English. Pass the recipient's `user.locale` first; for an address with no
 * account yet, such as an invitation, pass the sender's.
 */
export async function emailLocale(
  ...preferences: (string | null | undefined)[]
): Promise<Locale> {
  for (const preference of preferences) {
    if (isLocale(preference)) return preference
  }

  return (await sendingLocale()) ?? DEFAULT_LOCALE
}
