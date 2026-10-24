import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"

// Authenticator apps show the code in groups, and people paste it that way.
function totpCode(t: Translator<"auth">) {
  return z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, t("validation.totpInvalid")))
}

// Issued as `xxxxx-xxxxx`; compared exactly by Better Auth, so only the
// whitespace a copy and paste picks up is removed.
function backupCode(t: Translator<"auth">) {
  return z
    .string()
    .trim()
    .min(1, t("validation.backupCodeRequired"))
    .max(32, t("validation.backupCodeInvalid"))
}

export function createTwoFactorSchema(t: Translator<"auth">) {
  return z.discriminatedUnion("method", [
    z.object({
      method: z.literal("totp"),
      code: totpCode(t),
      trustDevice: z.boolean().default(false),
    }),
    z.object({
      method: z.literal("backup_code"),
      code: backupCode(t),
      trustDevice: z.boolean().default(false),
    }),
  ])
}
