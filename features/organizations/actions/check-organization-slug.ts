"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import {
  auth,
  getAccessContext,
  hasRole,
  isRootAdministrator,
  membershipIn,
} from "@/features/auth"
import { createOrganizationSlugSchema } from "@/features/organizations/schemas/create-organization"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import type { QueryResult } from "@/features/shared/types"

// Advisory only. Creation and renaming both check the slug again for real.
export async function checkOrganizationSlug(
  slug: string,
  organizationId?: string
): Promise<QueryResult<boolean>> {
  const parsedSlug = createOrganizationSlugSchema(
    await getTranslations("organizations")
  ).safeParse(slug)
  if (!parsedSlug.success) return { success: true, data: false }

  const access = await getAccessContext()
  if (!access.user) throw new UnauthorizedError()

  const membership = organizationId
    ? membershipIn(access, organizationId)
    : null
  const owns = membership !== null && hasRole(membership.role, "owner")

  if (!owns && !isRootAdministrator(access)) {
    throw new ForbiddenError("You cannot name organizations")
  }

  try {
    await auth.api.checkOrganizationSlug({
      body: { slug: parsedSlug.data },
      headers: await headers(),
    })
    return { success: true, data: true }
  } catch (error) {
    // Better Auth's own way of saying the slug is taken, not an outage.
    if (error instanceof APIError) {
      // An organization already holds its own slug, which is not a clash.
      return {
        success: true,
        data: membership !== null && parsedSlug.data === membership.slug,
      }
    }
    throw error
  }
}
