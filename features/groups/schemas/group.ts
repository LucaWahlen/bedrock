import { z } from "zod"

// What lands in the `urn:bedrock:groups` claim, so it is restricted to what a
// claim can carry safely and cannot be changed once applications rely on it.
export const groupKeySchema = z
  .string()
  .trim()
  .min(1, "Give the group a key")
  .max(64, "Use at most 64 characters")
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and - _ separators"
  )

export const groupSchema = z.object({
  organizationId: z.string().min(1),
  key: groupKeySchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  memberUserIds: z.array(z.string().min(1)).max(500).optional(),
  roleIds: z.array(z.string().min(1)).max(100).optional(),
})

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
