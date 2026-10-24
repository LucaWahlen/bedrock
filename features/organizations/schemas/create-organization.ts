import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"
import {
  isMediaAllowed,
  type MediaKind,
} from "@/features/shared/lib/storage/media"

// Factories, so the same rules speak the reader's language on both sides: the
// form passes `useTranslations("organizations")`, the action
// `getTranslations("organizations")`.
export function createMediaFileSchema(
  t: Translator<"organizations">,
  kind: MediaKind
) {
  return z
    .custom<File>(
      (value) => value instanceof File,
      t("validation.imageRequired")
    )
    .refine(
      (file) => isMediaAllowed(kind, file),
      kind === "logo"
        ? t("validation.logoFile")
        : kind === "background"
          ? t("validation.backgroundFile")
          : t("validation.faviconFile")
    )
}

export function createOrganizationColorSchema(t: Translator<"organizations">) {
  return z.union([
    z.literal(""),
    z.string().regex(/^#[0-9a-f]{6}$/i, t("validation.colorFormat")),
  ])
}

export function createOrganizationSlugSchema(t: Translator<"organizations">) {
  return z
    .string()
    .trim()
    .min(1, t("validation.slugRequired"))
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t("validation.slugFormat"))
}

export function createOrganizationNameSchema(t: Translator<"organizations">) {
  return z.string().trim().min(1, t("validation.organizationNameRequired"))
}

export function createOrganizationFormSchema(t: Translator<"organizations">) {
  return z.object({
    name: createOrganizationNameSchema(t),
    slug: createOrganizationSlugSchema(t),
    ownerIds: z.array(z.string().min(1)).min(1, t("validation.ownersRequired")),
    logo: createMediaFileSchema(t, "logo").optional(),
    backgroundImage: createMediaFileSchema(t, "background").optional(),
    favicon: createMediaFileSchema(t, "favicon").optional(),
    color: createOrganizationColorSchema(t),
  })
}

export type CreateOrganizationFormValues = z.infer<
  ReturnType<typeof createOrganizationFormSchema>
>
