// Browser-safe: no messages, no request APIs. The language switchers import it.
//
// Adding a language is one entry in `LOCALE_DETAILS` plus its
// `messages/<locale>/*.json`. A country not flagged yet also needs its SVG in
// `components/locale-flag.tsx`, which the type of `country` enforces.

export const LOCALES = ["en", "de"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

// next-intl's own name for it, so its tooling recognises the cookie.
export const LOCALE_COOKIE = "NEXT_LOCALE"

// ISO 3166-1 alpha-2 codes of the countries whose flags are drawn.
export type FlagCountry = "GB" | "DE"

export const LOCALE_DETAILS: Record<
  Locale,
  {
    // The language's name for itself, recognisable in any interface language.
    nativeName: string
    // A flag only illustrates; the native name is always the label.
    country: FlagCountry
  }
> = {
  en: { nativeName: "English", country: "GB" },
  de: { nativeName: "Deutsch", country: "DE" },
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale)
}
