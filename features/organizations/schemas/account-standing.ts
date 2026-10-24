import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"

const MINIMUM_REASON_LENGTH = 3
const MAXIMUM_REASON_LENGTH = 500

// The reason is shown to whoever enables the account again and kept on the
// audit event, so it has to say something.
export function createDisableAccountFormSchema(t: Translator<"organizations">) {
  return z.object({
    reason: z
      .string()
      .trim()
      .min(
        MINIMUM_REASON_LENGTH,
        t("validation.reasonTooShort", { min: MINIMUM_REASON_LENGTH })
      )
      .max(
        MAXIMUM_REASON_LENGTH,
        t("validation.reasonTooLong", { max: MAXIMUM_REASON_LENGTH })
      ),
  })
}

export function createDisableAccountInputSchema(
  t: Translator<"organizations">
) {
  return createDisableAccountFormSchema(t).extend({
    userId: z.string().min(1),
  })
}

export type DisableAccountFormValues = z.infer<
  ReturnType<typeof createDisableAccountFormSchema>
>
