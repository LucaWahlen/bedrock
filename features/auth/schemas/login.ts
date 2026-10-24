import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"

// A factory, so the same rules speak the reader's language on both sides: the
// form passes `useTranslations("auth")`, the action `getTranslations("auth")`.
export function createLoginSchema(t: Translator<"auth">) {
  return z.object({
    email: z.email(t("validation.emailInvalid")),
    password: z.string().min(1, t("validation.passwordRequired")),
  })
}
