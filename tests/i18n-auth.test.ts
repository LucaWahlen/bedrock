import { describe, expect, test } from "bun:test"

import { requestPasswordReset } from "@/features/auth/actions/request-password-reset"
import { resendVerificationEmail } from "@/features/auth/actions/resend-verification-email"
import { signInWithPasskey } from "@/features/auth/actions/sign-in-with-passkey"
import { signUp } from "@/features/auth/actions/sign-up"
import { verifyTwoFactor } from "@/features/auth/actions/verify-two-factor"
import { createSignUpSchema } from "@/features/auth/schemas/sign-up"
import { createTwoFactorSchema } from "@/features/auth/schemas/two-factor"
import { translatorFor } from "@/features/shared/lib/i18n/translator"
import { browse, setRequestHeader } from "@/tests/support/request"

function inGerman() {
  browse()
  setRequestHeader("accept-language", "de")
}

describe("auth schemas", () => {
  test("validate in the language of the translator they are given", () => {
    const english = createTwoFactorSchema(translatorFor("en", "auth"))
    const german = createTwoFactorSchema(translatorFor("de", "auth"))
    const input = { method: "totp", code: "12" } as const

    expect(english.safeParse(input).error?.issues[0]?.message).toBe(
      "Enter the 6-digit code from your app"
    )
    expect(german.safeParse(input).error?.issues[0]?.message).toBe(
      "Gib den 6-stelligen Code aus deiner App ein"
    )
  })

  test("never fall back to Zod's English defaults", async () => {
    const schema = createSignUpSchema(translatorFor("de", "auth"))
    const result = await schema.safeParseAsync({
      name: "",
      email: "not-an-address",
      password: "short",
    })

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Gib deinen Namen ein",
      "Gib eine gültige E-Mail-Adresse ein",
      "Verwende mindestens 8 Zeichen",
    ])
  })
})

describe("auth actions", () => {
  test("refuse a malformed sign-up in the visitor's language", async () => {
    browse()
    const input = { name: "Alice", email: "alice@example.com", password: "x" }
    expect(await signUp(input, "anywhere")).toEqual({
      success: false,
      error: "Use at least 8 characters",
    })

    inGerman()
    expect(await signUp(input, "anywhere")).toEqual({
      success: false,
      error: "Verwende mindestens 8 Zeichen",
    })
  })

  test("answer a password reset request in German", async () => {
    inGerman()
    expect(await requestPasswordReset("nobody", "anywhere")).toEqual({
      success: false,
      error: "Gib eine gültige E-Mail-Adresse ein",
    })
  })

  test("refuse a malformed passkey in German", async () => {
    inGerman()
    expect(await signInWithPasskey({ id: "?" })).toEqual({
      success: false,
      error: "Dieser Passkey konnte nicht verwendet werden",
    })
  })

  test("report an expired two-factor step in German", async () => {
    inGerman()
    expect(
      await verifyTwoFactor({ method: "totp", code: "123456" }, "anywhere")
    ).toEqual({
      success: false,
      error: "Deine Anmeldung ist abgelaufen. Melde dich erneut an.",
      expired: true,
    })
  })

  test("ask a visitor to sign in before resending a confirmation", async () => {
    inGerman()
    expect(await resendVerificationEmail("anywhere")).toEqual({
      success: false,
      error: "Melde dich zuerst an",
    })
  })
})
