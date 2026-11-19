import { z } from "zod"

import {
  isKindEmailLocked,
  isOrganizationKind,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
} from "@/features/notifications/lib/topics"
import type { Translator } from "@/features/shared/lib/i18n/translator"

export function createUpdateNotificationPreferenceSchema(
  t: Translator<"notifications">
) {
  const kindSchema = z.enum(NOTIFICATION_KINDS, {
    message: t("preferences.errors.invalidPreference"),
  })

  return z
    .object({
      kinds: z
        .array(kindSchema, {
          message: t("preferences.errors.invalidPreference"),
        })
        .min(1, t("preferences.errors.invalidPreference")),
      channel: z.enum(NOTIFICATION_CHANNELS, {
        message: t("preferences.errors.invalidPreference"),
      }),
      replaceOverrides: z
        .boolean({ message: t("preferences.errors.invalidPreference") })
        .optional(),
      enabled: z.boolean({
        message: t("preferences.errors.invalidPreference"),
      }),
      organizationId: z
        .string({ message: t("preferences.errors.invalidPreference") })
        .min(1, t("preferences.errors.invalidPreference"))
        .nullable()
        .optional(),
    })
    .superRefine((value, ctx) => {
      if (
        value.organizationId &&
        value.kinds.some((kind) => !isOrganizationKind(kind))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["organizationId"],
          message: t("preferences.errors.organizationKindOnly"),
        })
      }
      if (
        value.channel === "email" &&
        !value.enabled &&
        value.kinds.some((kind) => isKindEmailLocked(kind))
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["enabled"],
          message: t("preferences.errors.mandatoryEmail"),
        })
      }
    })
}
