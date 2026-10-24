"use server"

import { and, eq, inArray } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"
import { z } from "zod"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext, rootAdministration } from "@/features/auth"
import {
  cleanupBrandingObjects,
  promoteOrganizationBranding,
  type PromotedBranding,
  type StagedBranding,
} from "@/features/organizations/lib/branding-storage"
import { createOrganizationFormSchema } from "@/features/organizations/schemas/create-organization"
import type {
  CreateOrganizationInput,
  CreateOrganizationResult,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import {
  member,
  organization as organizationTable,
  user,
} from "@/features/shared/lib/db/schema"
import type { Translator } from "@/features/shared/lib/i18n/translator"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import { isOwnedStagedBrandingKey } from "@/features/shared/lib/storage/media"

const stagedMediaSchema = z.object({ key: z.string().min(1) })

const MAX_OWNERS = 20

function createOrganizationInputSchema(t: Translator<"organizations">) {
  return createOrganizationFormSchema(t)
    .pick({ name: true, slug: true, color: true, ownerIds: true })
    .extend({
      logo: stagedMediaSchema.optional(),
      backgroundImage: stagedMediaSchema.optional(),
      favicon: stagedMediaSchema.optional(),
    })
}

export async function createOrganization(
  input: CreateOrganizationInput
): Promise<CreateOrganizationResult> {
  const parsedInput = createOrganizationInputSchema(
    await getTranslations("organizations")
  ).safeParse(input)
  if (!parsedInput.success) {
    return { success: false, error: "Invalid organization details" }
  }

  const requestHeaders = await headers()
  const access = await getAccessContext()
  const currentUser = access.user
  const rootMembership = rootAdministration(access)
  if (!currentUser || !rootMembership) {
    await recordAuditEvent({
      action: "organization.created",
      outcome: "denied",
      actor: auditActorFromUser(access.user),
      reason: "Root administration is required",
    })

    return { success: false, error: "You cannot create organizations" }
  }

  const ownerIds = Array.from(new Set(parsedInput.data.ownerIds))
  if (ownerIds.length > MAX_OWNERS) {
    return { success: false, error: `Choose at most ${MAX_OWNERS} owners` }
  }

  const owners = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, ownerIds))

  if (owners.length === 0 || owners.length !== ownerIds.length) {
    return { success: false, error: "One of those owners does not exist" }
  }

  const creatorIsOwner = owners.some((owner) => owner.id === currentUser.id)

  const stagedBranding: StagedBranding[] = []
  if (parsedInput.data.logo) {
    stagedBranding.push({
      field: "logo",
      key: parsedInput.data.logo.key,
    })
  }
  if (parsedInput.data.backgroundImage) {
    stagedBranding.push({
      field: "backgroundImage",
      key: parsedInput.data.backgroundImage.key,
    })
  }
  if (parsedInput.data.favicon) {
    stagedBranding.push({
      field: "favicon",
      key: parsedInput.data.favicon.key,
    })
  }
  if (
    stagedBranding.some(
      (item) => !isOwnedStagedBrandingKey(item.key, currentUser.id)
    )
  ) {
    return { success: false, error: "Invalid organization media" }
  }

  let organizationId: string | undefined
  let promotedBranding: PromotedBranding[] = []

  try {
    const organization = await auth.api.createOrganization({
      body: {
        name: parsedInput.data.name,
        slug: parsedInput.data.slug,
        color: parsedInput.data.color || undefined,
      },
      headers: requestHeaders,
    })
    organizationId = organization.id

    promotedBranding = await promoteOrganizationBranding(
      organization.id,
      stagedBranding,
      currentUser.id
    )

    if (promotedBranding.length > 0) {
      const branding = Object.fromEntries(
        promotedBranding.map((item) => [item.field, item.publicUrl])
      )
      const updatedOrganization = await auth.api.updateOrganization({
        body: {
          organizationId: organization.id,
          data: branding,
        },
        headers: requestHeaders,
      })
      if (!updatedOrganization) {
        throw new Error("Could not attach organization branding")
      }
    }

    await cleanupBrandingObjects(stagedBranding.map((item) => item.key))

    const actor = auditActorFromUser(currentUser, rootMembership.organizationId)
    const auditedOrganization = {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    }

    await db.transaction(async (tx) => {
      await recordAuditEvent(
        {
          action: "organization.created",
          actor,
          organization: auditedOrganization,
          target: {
            type: "organization",
            id: organization.id,
            label: organization.name,
          },
        },
        tx
      )

      // Better Auth makes the caller the owner. Root administration of a
      // tenant is not a tenant membership, so a creator who is not among the
      // owners hands the organization over and keeps nothing.
      const createdAt = new Date()
      const newOwners = owners.filter((owner) => owner.id !== currentUser.id)

      if (newOwners.length > 0) {
        await tx.insert(member).values(
          newOwners.map((owner) => ({
            id: crypto.randomUUID(),
            organizationId: organization.id,
            userId: owner.id,
            role: "owner",
            createdAt,
          }))
        )
      }

      if (!creatorIsOwner) {
        await tx
          .delete(member)
          .where(
            and(
              eq(member.organizationId, organization.id),
              eq(member.userId, currentUser.id)
            )
          )
      }

      for (const owner of newOwners) {
        await recordAuditEvent(
          {
            action: "organization.member_added",
            actor,
            organization: auditedOrganization,
            target: { type: "user", id: owner.id, label: owner.name },
            metadata: { role: "owner" },
          },
          tx
        )
      }
    })
    revalidateEverywhere()

    return {
      success: true,
      slug: organization.slug,
      isMember: creatorIsOwner,
    }
  } catch (error) {
    await cleanupBrandingObjects(
      promotedBranding.map((item) => item.destinationKey)
    )
    if (organizationId) {
      // Deleted directly rather than through `auth.api.deleteOrganization`,
      // which is disabled so nothing can bypass the guarded delete action.
      // Memberships and invitations go with it by cascade.
      await db
        .delete(organizationTable)
        .where(eq(organizationTable.id, organizationId))
        .catch(() => undefined)
    }

    await recordAuditEvent({
      action: "organization.created",
      outcome: "failure",
      actor: auditActorFromUser(currentUser, rootMembership.organizationId),
      organization: {
        id: organizationId ?? null,
        name: parsedInput.data.name,
        slug: parsedInput.data.slug,
      },
      reason:
        error instanceof Error
          ? error.message
          : "Could not create organization",
    }).catch(() => undefined)

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not create organization",
    }
  }
}
