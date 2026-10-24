import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"
import {
  MINIMUM_PASSWORD_LENGTH,
  refuseWeakPassword,
} from "@/features/shared/lib/password-strength"

const MAXIMUM_NAME_LENGTH = 100
const MAXIMUM_PASSWORD_LENGTH = 128

// The address is settled by the token, so only the account details are asked
// for. Kept in step with `features/auth`'s own floor and its refusals.
export function createAccountDetailsSchema(t: Translator<"organizations">) {
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
      password: z
        .string()
        .min(
          MINIMUM_PASSWORD_LENGTH,
          t("validation.passwordTooShort", { min: MINIMUM_PASSWORD_LENGTH })
        )
        .max(
          MAXIMUM_PASSWORD_LENGTH,
          t("validation.tooLong", { max: MAXIMUM_PASSWORD_LENGTH })
        ),
    })
    .superRefine(refuseWeakPassword)
}
