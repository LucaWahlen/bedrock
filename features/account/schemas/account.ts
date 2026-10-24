import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"
import {
  MINIMUM_PASSWORD_LENGTH,
  refuseWeakPassword,
} from "@/features/shared/lib/password-strength"
import { isMediaAllowed } from "@/features/shared/lib/storage/media"

// Shared by the dialog's forms and the actions behind them, so a rule that is
// wrong here is wrong on both sides of the request. Factories, so the same
// rules speak the reader's language on both sides: the form passes
// `useTranslations("account")`, the action `getTranslations("account")`.

type AccountTranslator = Translator<"account">

function accountName(t: AccountTranslator) {
  return z
    .string()
    .trim()
    .min(1, t("validation.nameRequired"))
    .max(100, t("validation.tooLong", { max: 100 }))
}

function currentPassword(t: AccountTranslator) {
  return z
    .string()
    .min(1, t("validation.currentPasswordRequired"))
    .max(128, t("validation.tooLong", { max: 128 }))
}

// An absent picture cannot mean "leave it alone" and "clear it" at once, so the
// form says which of the three it is.
export function createProfileFormSchema(t: AccountTranslator) {
  const avatarFile = z
    .custom<File>(
      (value) => value instanceof File,
      t("validation.pictureRequired")
    )
    .refine(
      (file) => isMediaAllowed("avatar", file),
      t("validation.pictureInvalid")
    )

  return z.object({
    name: accountName(t),
    avatar: z.discriminatedUnion("action", [
      z.object({ action: z.literal("keep") }),
      z.object({ action: z.literal("remove") }),
      z.object({ action: z.literal("replace"), file: avatarFile }),
    ]),
  })
}

// The same once the browser has staged its upload and holds a key, not a file.
export function createUpdateProfileInputSchema(t: AccountTranslator) {
  return z.object({
    name: accountName(t),
    avatar: z.discriminatedUnion("action", [
      z.object({ action: z.literal("keep") }),
      z.object({ action: z.literal("remove") }),
      z.object({
        action: z.literal("replace"),
        key: z
          .string()
          .min(1, t("errors.invalidPicture"))
          .max(512, t("errors.invalidPicture")),
      }),
    ]),
  })
}

// Mirrors the sign-up rule, including how guessable it may be. The name and
// address are optional known inputs: the action supplies the account's own,
// so a password made of them is refused even if the form did not send them.
export function createChangePasswordSchema(t: AccountTranslator) {
  return z
    .object({
      currentPassword: currentPassword(t),
      password: z
        .string()
        .min(
          MINIMUM_PASSWORD_LENGTH,
          t("validation.passwordTooShort", { min: MINIMUM_PASSWORD_LENGTH })
        )
        .max(128, t("validation.tooLong", { max: 128 })),
      revokeOtherSessions: z.boolean().default(true),
      name: z.string().optional(),
      email: z.string().optional(),
    })
    .refine((value) => value.password !== value.currentPassword, {
      path: ["password"],
      message: t("validation.passwordUnchanged"),
    })
    .superRefine(refuseWeakPassword)
}

// Lowercased like every other address the instance stores, so the same inbox
// can never be two accounts.
export function createChangeEmailSchema(t: AccountTranslator) {
  return z.object({
    newEmail: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email(t("validation.emailInvalid"))),
    currentPassword: currentPassword(t),
  })
}

// Either factor, for confirming something sensitive while signed in: six
// digits is an authenticator code, anything else is tried as a backup code.
export function createSecondFactorCodeSchema(t: AccountTranslator) {
  return z
    .string()
    .trim()
    .min(1, t("validation.secondFactorRequired"))
    .max(32, t("validation.codeInvalid"))
}

// The code is only required of an account with two-factor authentication on,
// which the action decides from the account itself, never from the form.
export function createDeleteAccountSchema(t: AccountTranslator) {
  return z.object({
    currentPassword: currentPassword(t),
    code: z.string().trim().max(32, t("validation.codeInvalid")).optional(),
  })
}

export function createPasswordConfirmationSchema(t: AccountTranslator) {
  return z.object({ currentPassword: currentPassword(t) })
}

export function createEnrollmentCodeSchema(t: AccountTranslator) {
  return z.object({
    code: z
      .string()
      .transform((value) => value.replace(/\s+/g, ""))
      .pipe(z.string().regex(/^\d{6}$/, t("validation.enrollmentCode"))),
  })
}

export function createDisableTwoFactorSchema(t: AccountTranslator) {
  return z.object({
    currentPassword: currentPassword(t),
    code: createSecondFactorCodeSchema(t),
  })
}

export function createPasskeyNameSchema(t: AccountTranslator) {
  return z
    .string()
    .trim()
    .min(1, t("validation.passkeyNameRequired"))
    .max(64, t("validation.tooLong", { max: 64 }))
}

export function createAddPasskeySchema(t: AccountTranslator) {
  return z.object({
    name: createPasskeyNameSchema(t),
    currentPassword: currentPassword(t),
  })
}

export function createRenamePasskeySchema(t: AccountTranslator) {
  return z.object({
    id: z
      .string()
      .min(1, t("errors.passkeyNotFound"))
      .max(255, t("errors.passkeyNotFound")),
    name: createPasskeyNameSchema(t),
  })
}

// Identifiers and the browser's WebAuthn response are never shown back to
// anyone; a value that fails these is answered with the action's own message.
export const passkeyIdSchema = z.string().min(1).max(255)

const base64url = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[A-Za-z0-9_-]*$/)

// What `@simplewebauthn/browser` hands back from `startRegistration`. Only the
// shape is checked here; the attestation, challenge, origin and relying party
// are verified by the passkey plugin.
export const passkeyRegistrationResponseSchema = z.object({
  id: base64url(1024).min(1),
  rawId: base64url(1024).min(1),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64url(8192),
    attestationObject: base64url(65536),
    authenticatorData: base64url(65536).optional(),
    transports: z.array(z.string().max(32)).max(10).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64url(8192).optional(),
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
})

export const sessionIdSchema = z.string().min(1).max(255)
