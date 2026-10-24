"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import {
  getAccessContext,
  hasRole,
  type MutationOrganization,
} from "@/features/auth"
import {
  cleanupBrandingObjects,
  deleteOrganizationBrandingObjects,
  promoteOrganizationBranding,
  type PromotedBranding,
  type StagedBranding,
} from "@/features/organizations/lib/branding-storage"
import {
  authorizeOrganizationMutation,
  organizationMutation,
} from "@/features/organizations/lib/organization-mutation"
import { createUpdateOrganizationInputSchema } from "@/features/organizations/schemas/update-organization"
import type {
  MediaUpdate,
  UpdateOrganizationInput,
  UpdateOrganizationResult,
} from "@/features/organizations/types"
import { organization } from "@/features/shared/lib/db/schema"
import { isOwnedStagedBrandingKey } from "@/features/shared/lib/storage/media"

type BrandingField = "logo" | "backgroundImage" | "favicon"

const BRANDING_FIELDS = ["logo", "backgroundImage", "favicon"] as const

export async function updateOrganization(
  input: UpdateOrganizationInput
): Promise<UpdateOrganizationResult> {
  const parsedInput = createUpdateOrganizationInputSchema(
    await getTranslations("organizations")
  ).safeParse(input)
  if (!parsedInput.success) {
    return { success: false, error: "Invalid organization details" }
  }

  const {
    organizationId,
    name,
    slug,
    color,
    allowPublicSignUp,
    requireTwoFactor,
  } = parsedInput.data

  const authorization = await authorizeOrganizationMutation({
    action: "organization.updated",
    organizationId,
    require: "administrator",
    deniedError: "You cannot change this organization",
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { context } = authorization
  const current = context.organization

  // Root's name, slug, colour and branding are seeded once from the instance
  // configuration and are not the product's to change afterwards.
  if (current.isRoot) {
    return {
      success: false,
      error: "The root organization is set by the instance configuration",
    }
  }

  // Nobody with a membership can be inside a suspended or deleted
  // organization, so reaching here for one means the request did not come
  // from a page.
  if (current.status !== "active") {
    return {
      success: false,
      error: "This organization has to be active before it can be changed",
    }
  }

  // Administration got this far; the address everyone reaches the organization
  // by is an owner's alone.
  if (slug !== undefined && slug !== current.slug) {
    const role = context.membershipRole
    if (!role || !hasRole(role, "owner")) {
      return { success: false, error: "Only owners can change the slug" }
    }
  }

  // Requiring a second factor decides who can get in at all, so like the slug
  // it is an owner's alone.
  if (
    requireTwoFactor !== undefined &&
    requireTwoFactor !== current.requireTwoFactor
  ) {
    const role = context.membershipRole
    if (!role || !hasRole(role, "owner")) {
      return {
        success: false,
        error: "Only owners can change whether a second factor is required",
      }
    }

    // Turning it on without one would lock the owner out of the page that
    // turns it off again.
    if (requireTwoFactor && !(await getAccessContext()).user?.hasSecondFactor) {
      return {
        success: false,
        error:
          "Set up two-factor authentication or a passkey on your own account first",
      }
    }
  }

  const staged: StagedBranding[] = []
  for (const field of BRANDING_FIELDS) {
    const update = parsedInput.data[field]
    if (update?.action === "replace") staged.push({ field, key: update.key })
  }

  if (
    staged.some(
      (item) => !isOwnedStagedBrandingKey(item.key, context.actorUser.id)
    )
  ) {
    return { success: false, error: "Invalid organization media" }
  }

  let promoted: PromotedBranding[] = []

  try {
    promoted = await promoteOrganizationBranding(
      current.id,
      staged,
      context.actorUser.id
    )

    const set = {
      ...(name !== undefined && { name }),
      ...(slug !== undefined && { slug }),
      ...(color !== undefined && { color: color || null }),
      ...(allowPublicSignUp !== undefined && { allowPublicSignUp }),
      ...(requireTwoFactor !== undefined && { requireTwoFactor }),
      ...brandingChanges(parsedInput.data, promoted),
    }
    const changed = changedFields(current, set)

    if (changed.length === 0) return { success: true, slug: current.slug }

    const result = await organizationMutation({
      context,
      action: "organization.updated",
      // Guarded on the status the decision above was made against.
      expected: eq(organization.status, "active"),
      set,
      metadata: {
        changed,
        ...(changed.includes("name") && {
          name: { from: current.name, to: name },
        }),
        ...(changed.includes("slug") && {
          slug: { from: current.slug, to: slug },
        }),
        ...(changed.includes("requireTwoFactor") && {
          requireTwoFactor: {
            from: current.requireTwoFactor,
            to: requireTwoFactor,
          },
        }),
      },
      failureError: "Organization cannot be changed",
      failureReason: "Organization was not active",
    })

    if (!result.success) {
      await cleanupBrandingObjects(promoted.map((item) => item.destinationKey))
      return result
    }

    await cleanupBrandingObjects(staged.map((item) => item.key))
    await deleteOrganizationBrandingObjects(
      current.id,
      replacedBrandingUrls(current, parsedInput.data)
    )

    return { success: true, slug: slug ?? current.slug }
  } catch (error) {
    await cleanupBrandingObjects(promoted.map((item) => item.destinationKey))
    // A storage fault or a slug that was taken between the check and the write
    // both land here. Neither is the caller's to read, so it is logged instead.
    console.error("Organization could not be changed", error)

    return { success: false, error: "Could not change the organization" }
  }
}

function brandingChanges(
  input: Partial<Record<BrandingField, { action: MediaUpdate["action"] }>>,
  promoted: PromotedBranding[]
) {
  const changes: Partial<Record<BrandingField, string | null>> = {}

  for (const field of BRANDING_FIELDS) {
    const action = input[field]?.action
    if (action === "remove") changes[field] = null
    if (action === "replace") {
      changes[field] =
        promoted.find((item) => item.field === field)?.publicUrl ?? null
    }
  }

  return changes
}

// What the previous object was, for each image the save moves off.
function replacedBrandingUrls(
  current: MutationOrganization,
  input: Partial<Record<BrandingField, { action: MediaUpdate["action"] }>>
) {
  return BRANDING_FIELDS.filter((field) => {
    const action = input[field]?.action
    return action === "remove" || action === "replace"
  }).flatMap((field) => current[field] ?? [])
}

// Named on the audit event, so the log says what the save actually altered.
function changedFields(
  current: MutationOrganization,
  next: Partial<MutationOrganization>
) {
  return Object.keys(next).filter(
    (field) =>
      next[field as keyof MutationOrganization] !==
      current[field as keyof MutationOrganization]
  )
}
