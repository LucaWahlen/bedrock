"use server"

import { and, eq, ne } from "drizzle-orm"
import { cache } from "react"

import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"

// Deleted organizations are excluded here rather than at each route, so every
// tenant-facing surface conceals one the same way: it simply does not exist.
const findOrganizationBySlug = cache((slug: string) =>
  db.query.organization.findFirst({
    columns: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      isRoot: true,
      status: true,
      color: true,
      backgroundImage: true,
      favicon: true,
      allowPublicSignUp: true,
      requireTwoFactor: true,
    },
    where: and(eq(organization.slug, slug), ne(organization.status, "deleted")),
  })
)

export async function getOrganizationBySlug(slug: string) {
  return findOrganizationBySlug(slug)
}
