import { auth } from "@/features/shared/lib/auth"
import { headers } from "next/headers"
import { db } from "@/features/shared/lib/db"
import { organization } from "@/features/shared/lib/schema"
import { eq } from "drizzle-orm"

export async function getOrganizations() {
  return auth.api.listOrganizations({ headers: await headers() })
}