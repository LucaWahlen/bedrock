import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"
import {
  MINIMUM_PASSWORD_LENGTH,
  refuseWeakPassword,
} from "@/features/shared/lib/password-strength"

const MAXIMUM_PASSWORD_LENGTH = 128
const MAXIMUM_NAME_LENGTH = 100

// Better Auth's own floor is 8 characters; asking for more here would only be
// rejected later by a different message. How guessable it is beyond that is
// `refuseWeakPassword`'s to judge, and these schemas are async because of it.
function passwordRule(t: Translator<"auth">) {
  return z
    .string()
    .min(
      MINIMUM_PASSWORD_LENGTH,
      t("validation.passwordTooShort", { min: MINIMUM_PASSWORD_LENGTH })
    )
    .max(
      MAXIMUM_PASSWORD_LENGTH,
      t("validation.tooLong", { max: MAXIMUM_PASSWORD_LENGTH })
    )
}

// The name and address are given to zxcvbn as known inputs, so a password made
// of them scores as badly as it deserves.
export function createSignUpSchema(t: Translator<"auth">) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, t("validation.nameRequired"))
        .max(
          MAXIMUM_NAME_LENGTH,
          t("validation.tooLong", { max: MAXIMUM_NAME_LENGTH })
        ),
      email: z.email(t("validation.emailInvalid")),
      password: passwordRule(t),
    })
    .superRefine(refuseWeakPassword)
}

export function createNewPasswordSchema(t: Translator<"auth">) {
  return z.object({ password: passwordRule(t) }).superRefine(refuseWeakPassword)
}

export function createEmailSchema(t: Translator<"auth">) {
  return z.object({ email: z.email(t("validation.emailInvalid")) })
}

export type EmailOnly = z.infer<ReturnType<typeof createEmailSchema>>
