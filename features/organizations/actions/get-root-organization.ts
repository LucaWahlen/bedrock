"use server"

import { eq } from "drizzle-orm"
import { cache } from "react"

import { db } from "@/features/shared/lib/db/client"
import { organization } from "@/features/shared/lib/db/schema"

const findRootOrganization = cache(() =>
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
    },
    where: eq(organization.isRoot, true),
  })
)

export async function getRootOrganization() {
  return findRootOrganization()
}
