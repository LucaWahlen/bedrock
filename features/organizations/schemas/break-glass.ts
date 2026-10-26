import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"

const MINIMUM_REASON_LENGTH = 10
const MAXIMUM_REASON_LENGTH = 500

// The reason is mailed to the organization's owners and kept on the audit
// event, so it has to explain why root needed to be inside.
export function createBreakGlassFormSchema(t: Translator<"organizations">) {
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

export function createBreakGlassInputSchema(t: Translator<"organizations">) {
  return createBreakGlassFormSchema(t).extend({
    organizationId: z.string().min(1),
  })
}

export type BreakGlassFormValues = z.infer<
  ReturnType<typeof createBreakGlassFormSchema>
>
