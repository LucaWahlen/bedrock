import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
} from "@/features/shared/lib/i18n/config"

// The first supported language in an `Accept-Language` header, by quality and
// then by order. A regional tag counts for its language: `de-AT` is German.
export function negotiateLocale(
  acceptLanguage: string | null | undefined
): Locale | null {
  if (!acceptLanguage) return null

  const ranges = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...parameters] = part.split(";")
      const qualityParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="))
      const quality = qualityParameter ? Number(qualityParameter.slice(2)) : 1

      return {
        language: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      }
    })
    .filter((range) => range.quality > 0)
    .toSorted((a, b) => b.quality - a.quality || a.index - b.index)

  for (const { language } of ranges) {
    if (isLocale(language)) return language
  }

  return null
}

// The order every request is resolved in: what a signed-in person chose, then
// what this browser chose, then what it asks for. Anything unsupported or
// tampered with is skipped rather than trusted.
export function resolveLocale({
  preference,
  cookie,
  acceptLanguage,
}: {
  preference?: string | null
  cookie?: string | null
  acceptLanguage?: string | null
}): Locale {
  if (isLocale(preference)) return preference
  if (isLocale(cookie)) return cookie

  return negotiateLocale(acceptLanguage) ?? DEFAULT_LOCALE
}
