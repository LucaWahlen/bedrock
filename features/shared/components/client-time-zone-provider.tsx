"use client"

import { NextIntlClientProvider, useLocale, useTimeZone } from "next-intl"
import { useSyncExternalStore, type ReactNode } from "react"

function subscribeToNothing() {
  return () => {}
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

/**
 * The server renders in UTC because it does not know the reader's zone. Nested
 * `NextIntlClientProvider` inherits `messages` and `formats` from the outer
 * provider, keeps the server zone through hydration, and switches to the
 * browser's zone once mounted.
 */
export function ClientTimeZoneProvider({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const serverTimeZone = useTimeZone()
  const timeZone = useSyncExternalStore(
    subscribeToNothing,
    browserTimeZone,
    () => serverTimeZone
  )

  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  )
}
