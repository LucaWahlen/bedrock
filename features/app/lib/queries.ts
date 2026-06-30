import { db } from "@/features/shared/lib/db"
import { organizations } from "@/features/shared/lib/schema"

export async function getOrganizations() {
  return db.select().from(organizations)
}
