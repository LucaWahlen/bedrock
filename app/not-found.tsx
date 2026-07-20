import { eq } from "drizzle-orm"
import type { Metadata } from "next"

import { StatusPage } from "@/features/app"
import { db } from "@/features/shared/lib/db"
import { organization } from "@/features/shared/lib/schema"

export const metadata: Metadata = {
  title: "404 | Bedrock",
}

export default async function NotFound() {
  const rootOrganization = await db.query.organization.findFirst({
    where: eq(organization.isRoot, true),
  })

  return (
    <StatusPage
      organization={rootOrganization}
      code="404"
      title="Page not found"
      description="The page you are looking for does not exist or has been moved."
      action={{ href: "/", label: "Go back home" }}
    />
  )
}
