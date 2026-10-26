import { z } from "zod"

import type { Translator } from "@/features/shared/lib/i18n/translator"

// What lands in the `urn:bedrock:groups` claim, so it is restricted to what a
// claim can carry safely and cannot be changed once applications rely on it.
export function createGroupKeySchema(t: Translator<"groups">) {
  return z
    .string()
    .trim()
    .min(1, t("validation.keyRequired"))
    .max(64, t("validation.tooLong", { max: 64 }))
    .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, t("validation.keyFormat"))
}

export function createGroupSchema(t: Translator<"groups">) {
  return z.object({
    organizationId: z.string().min(1),
    key: createGroupKeySchema(t),
    name: z
      .string()
      .trim()
      .min(1, t("validation.nameRequired"))
      .max(100, t("validation.tooLong", { max: 100 })),
    description: z
      .string()
      .trim()
      .max(500, t("validation.tooLong", { max: 500 }))
      .nullish(),
    memberUserIds: z
      .array(z.string().min(1, t("errors.notMember")))
      .max(500, t("validation.membersTooMany", { max: 500 }))
      .optional(),
    roleIds: z
      .array(z.string().min(1, t("errors.unknownRole")))
      .max(100, t("validation.rolesTooMany", { max: 100 }))
      .optional(),
  })
}

// Identifiers only, never typed by anyone: the actions answer a failure with
// their own message, so these carry none.
export const groupMembersSchema = z.object({
  organizationId: z.string().min(1),
  groupId: z.string().min(1),
  add: z.array(z.string().min(1)).max(500),
  remove: z.array(z.string().min(1)).max(500),
})

export const memberGroupsSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  groupIds: z.array(z.string().min(1)).max(100),
})

export const groupRolesSchema = z.object({
  organizationId: z.string().min(1),
  groupId: z.string().min(1),
  roleIds: z.array(z.string().min(1)).max(100),
})
