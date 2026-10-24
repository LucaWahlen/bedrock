import { z } from "zod"

import {
  createMediaFileSchema,
  createOrganizationColorSchema,
  createOrganizationNameSchema,
  createOrganizationSlugSchema,
} from "@/features/organizations/schemas/create-organization"
import type { Translator } from "@/features/shared/lib/i18n/translator"
import type { MediaKind } from "@/features/shared/lib/storage/media"

// An absent image cannot mean "leave it alone" and "clear it" at once, so an
// update says which of the three it is.
function createMediaUpdateSchema(
  t: Translator<"organizations">,
  kind: MediaKind
) {
  return z.discriminatedUnion("action", [
    z.object({ action: z.literal("keep") }),
    z.object({ action: z.literal("remove") }),
    z.object({
      action: z.literal("replace"),
      file: createMediaFileSchema(t, kind),
    }),
  ])
}

// One form per block of the settings page, so each saves only what it owns.
export function createOrganizationProfileSchema(
  t: Translator<"organizations">
) {
  return z.object({
    name: createOrganizationNameSchema(t),
    color: createOrganizationColorSchema(t),
    logo: createMediaUpdateSchema(t, "logo"),
    backgroundImage: createMediaUpdateSchema(t, "background"),
    favicon: createMediaUpdateSchema(t, "favicon"),
  })
}

export const organizationAccessSchema = z.object({
  allowPublicSignUp: z.boolean(),
})

export const organizationTwoFactorSchema = z.object({
  requireTwoFactor: z.boolean(),
})

export function createOrganizationSlugFormSchema(
  t: Translator<"organizations">
) {
  return z.object({ slug: createOrganizationSlugSchema(t) })
}

export type OrganizationProfileValues = z.infer<
  ReturnType<typeof createOrganizationProfileSchema>
>

export type OrganizationAccessValues = z.infer<typeof organizationAccessSchema>

export type OrganizationTwoFactorValues = z.infer<
  typeof organizationTwoFactorSchema
>

export type OrganizationSlugValues = z.infer<
  ReturnType<typeof createOrganizationSlugFormSchema>
>

// The same shape once the browser has staged its uploads and holds keys rather
// than files. Every field is optional because a block sends only its own.
const stagedMediaUpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("remove") }),
  z.object({ action: z.literal("replace"), key: z.string().min(1) }),
])

export function createUpdateOrganizationInputSchema(
  t: Translator<"organizations">
) {
  return z.object({
    organizationId: z.string().min(1),
    name: createOrganizationNameSchema(t).optional(),
    slug: createOrganizationSlugSchema(t).optional(),
    color: createOrganizationColorSchema(t).optional(),
    allowPublicSignUp: z.boolean().optional(),
    requireTwoFactor: z.boolean().optional(),
    logo: stagedMediaUpdateSchema.optional(),
    backgroundImage: stagedMediaUpdateSchema.optional(),
    favicon: stagedMediaUpdateSchema.optional(),
  })
}
