import { afterAll, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { cookies } from "next/headers"

import { setLocale } from "@/features/account/actions/set-locale"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { login } from "@/features/auth/actions/login"
import { setVisitorLocale } from "@/features/auth/actions/set-visitor-locale"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import { emailLocale } from "@/features/shared/lib/email/locale"
import { renderEmail } from "@/features/shared/lib/email/render"
import { VerifyEmail } from "@/features/shared/lib/email/templates/verify-email"
import { LOCALE_COOKIE, type Locale } from "@/features/shared/lib/i18n/config"
import {
  negotiateLocale,
  resolveLocale,
} from "@/features/shared/lib/i18n/resolve-locale"
import { requestLocale } from "@/i18n/request"
import { checkCatalogs, loadCatalogs } from "@/scripts/i18n/check"
import { createFixture } from "@/tests/support/fixtures"
import {
  actAs,
  browse,
  browserCookies,
  setRequestHeader,
} from "@/tests/support/request"

const fixture = await createFixture("i18n")
const { alice, bob } = fixture

afterAll(() => fixture.cleanup())

async function storedLocale(userId: string) {
  const [row] = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, userId))

  return row?.locale
}

async function setCookie(value: string) {
  ;(await cookies()).set(LOCALE_COOKIE, value)
}

describe("resolving a locale", () => {
  test("a preference outranks the cookie, which outranks the browser", () => {
    expect(
      resolveLocale({ preference: "de", cookie: "en", acceptLanguage: "en" })
    ).toBe("de")
    expect(
      resolveLocale({ preference: null, cookie: "de", acceptLanguage: "en" })
    ).toBe("de")
    expect(
      resolveLocale({ preference: null, cookie: null, acceptLanguage: "de" })
    ).toBe("de")
  })

  test("falls back to English when nothing is supported", () => {
    expect(resolveLocale({})).toBe("en")
    expect(resolveLocale({ acceptLanguage: "fr-FR, es;q=0.8" })).toBe("en")
  })

  test("skips a tampered or unsupported value instead of trusting it", () => {
    expect(
      resolveLocale({ preference: "xx", cookie: "fr", acceptLanguage: "de" })
    ).toBe("de")
  })

  test("negotiates by quality, then order, and by language for a region", () => {
    expect(negotiateLocale("fr;q=1, de-AT;q=0.9, en;q=0.8")).toBe("de")
    expect(negotiateLocale("en;q=0.5, de;q=0.9")).toBe("de")
    expect(negotiateLocale("de;q=0, en")).toBe("en")
    expect(negotiateLocale("*")).toBeNull()
    expect(negotiateLocale(null)).toBeNull()
  })
})

describe("the locale of a request", () => {
  test("is English for a visitor who says nothing", async () => {
    browse()
    expect(await requestLocale()).toBe("en")
  })

  test("follows Accept-Language, then the cookie over it", async () => {
    browse()
    setRequestHeader("accept-language", "de-DE,de;q=0.9,en;q=0.8")
    expect(await requestLocale()).toBe("de")

    await setCookie("en")
    expect(await requestLocale()).toBe("en")
  })

  test("follows a signed-in person's choice over the cookie", async () => {
    await db.update(user).set({ locale: "de" }).where(eq(user.id, bob.id))
    await actAs(bob)
    await setCookie("en")
    setRequestHeader("accept-language", "en")

    expect(await requestLocale()).toBe("de")
    const t = await getTranslations("common.errors")
    expect(t("notSignedIn")).toBe("Du bist nicht angemeldet")

    await db.update(user).set({ locale: null }).where(eq(user.id, bob.id))
  })

  test("ignores a stored value no longer supported", async () => {
    await db.update(user).set({ locale: "fr" }).where(eq(user.id, bob.id))
    await actAs(bob)
    setRequestHeader("accept-language", "de")

    expect((await getAccessContext()).user?.locale).toBeNull()
    expect(await requestLocale()).toBe("de")

    await db.update(user).set({ locale: null }).where(eq(user.id, bob.id))
  })
})

describe("setting a signed-in person's language", () => {
  test("is refused to a visitor, and stores nothing", async () => {
    browse()
    expect(await setLocale("de")).toEqual({
      success: false,
      error: "You are not signed in",
    })
    expect(browserCookies().has(LOCALE_COOKIE)).toBe(false)
  })

  test("refuses a locale that is not supported", async () => {
    await actAs(alice)
    expect(await setLocale("fr" as Locale)).toEqual({
      success: false,
      error: "Could not change the language",
    })
    expect(await storedLocale(alice.id)).toBeNull()
    expect(browserCookies().has(LOCALE_COOKIE)).toBe(false)
  })

  test("stores it on their account only, and remembers it in the browser", async () => {
    await actAs(alice)
    expect(await setLocale("de")).toEqual({ success: true })

    expect(await storedLocale(alice.id)).toBe("de")
    expect(await storedLocale(bob.id)).toBeNull()
    expect(browserCookies().get(LOCALE_COOKIE)).toBe("de")
    expect((await getAccessContext()).user?.locale).toBe("de")

    // The next answer already speaks it.
    expect(await setLocale("fr" as Locale)).toEqual({
      success: false,
      error: "Die Sprache konnte nicht geändert werden",
    })

    await actAs(bob)
    expect(await requestLocale()).toBe("en")
  })
})

describe("setting a visitor's language", () => {
  test("remembers a supported one in the browser", async () => {
    browse()
    expect(await setVisitorLocale("de")).toEqual({ success: true })
    expect(browserCookies().get(LOCALE_COOKIE)).toBe("de")
    expect(await requestLocale()).toBe("de")
  })

  test("refuses anything else", async () => {
    browse()
    expect(await setVisitorLocale("fr" as Locale)).toEqual({
      success: false,
      error: "Could not change the language",
    })
    expect(browserCookies().has(LOCALE_COOKIE)).toBe(false)
  })
})

describe("translated action errors", () => {
  test("a refused sign-in answers in the visitor's language", async () => {
    browse()
    expect(await login({ email: "nobody", password: "" })).toEqual({
      success: false,
      error: "Invalid email or password",
    })

    setRequestHeader("accept-language", "de")
    expect(await login({ email: "nobody", password: "" })).toEqual({
      success: false,
      error: "E-Mail-Adresse oder Passwort ist falsch",
    })
  })
})

describe("mail", () => {
  const brand = { organizationName: "Acme", logoUrl: null, color: "#7c3aed" }

  test("is written in the first supported preference", async () => {
    browse()
    expect(await emailLocale("de", "en")).toBe("de")
    expect(await emailLocale(null, "fr", "de")).toBe("de")
  })

  test("falls back to the language of the request sending it", async () => {
    browse()
    expect(await emailLocale(null)).toBe("en")
    setRequestHeader("accept-language", "de")
    expect(await emailLocale(undefined)).toBe("de")
  })

  test("renders the verification mail in the given language", async () => {
    const props = { brand, name: "Alice", url: "https://example.test/verify" }
    const german = await renderEmail(VerifyEmail({ ...props, locale: "de" }))
    const english = await renderEmail(VerifyEmail({ ...props, locale: "en" }))

    expect(german.text).toContain("Hallo Alice, bestätige diese Adresse")
    expect(german.text).toContain("kopiere diesen Link in deinen Browser")
    expect(german.html).toContain('lang="de"')
    expect(english.text).toContain("Hi Alice, confirm this address")
  })
})

describe("the message check", () => {
  test("passes for the committed messages", async () => {
    const { catalogs, problems } = await loadCatalogs()
    expect(problems).toEqual([])
    expect(checkCatalogs(catalogs)).toEqual([])
  })

  test("reports every way the languages can drift apart", () => {
    const problems = checkCatalogs({
      en: {
        feature: {
          title: "Title",
          greeting: "Hello {name}",
          link: "Read <link>more</link>",
          onlyEnglish: "Only here",
          broken: "Fine",
        },
        orphan: {},
      },
      de: {
        feature: {
          title: " ",
          greeting: "Hallo {person}",
          link: "Mehr <link>lesen</link>",
          onlyGerman: "Nur hier",
          broken: "{unclosed",
        },
        stray: {},
      },
    })

    expect(problems).toEqual([
      'de/feature.json: missing "onlyEnglish"',
      'de/feature.json: "title" is empty',
      'de/feature.json: "greeting" uses {person}, but en/feature.json uses {name}',
      'de/feature.json: "onlyGerman" is not in en/feature.json',
      expect.stringMatching(/^de\/feature\.json: "broken" is not valid ICU/),
      "de/orphan.json: missing",
      "en/stray.json: missing",
    ])
  })
})
