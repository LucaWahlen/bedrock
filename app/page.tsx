import { redirect } from "next/navigation"

import { canAccessOrganization, getAccessContext } from "@/features/auth"
import { env } from "@/features/shared/lib/config/env"

export default async function Page() {
  const access = await getAccessContext()
  const destination = access.memberships.find(canAccessOrganization)

  redirect(`/org/${destination?.slug ?? env.rootOrganization.slug}`)
}
