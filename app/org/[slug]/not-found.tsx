import { eq } from "drizzle-orm"
import type { Metadata } from "next"

import { StatusPage } from "@/features/app"
import { db } from "@/features/shared/lib/db"
import { organization } from "@/features/shared/lib/schema"

export const metadata: Metadata = {
  title: "404 | Bedrock",
}

export default async function OrganizationNotFound() {
  const rootOrganization = await db.query.organization.findFirst({
    where: eq(organization.isRoot, true),
  })

  return (
    <StatusPage
      organization={rootOrganization}
      code="404"
      title="Organization not found"
      description="The organization you are looking for does not exist or is no longer available."
      action={{ href: "/", label: "Go back home" }}
    />
  )
}
