import { eq } from "drizzle-orm"

import { auth } from "@/features/auth"
import { db } from "@/features/shared/lib/db"
import { organization, member } from "@/features/shared/lib/schema"

const EMAIL = "admin@example.com"
const PASSWORD = "admin123"
const ROOT_ORG = {
  name: "Bedrock",
  slug: "bedrock",
  logo: "https://cdn.lucawahlen.com/bedrock-logo.svg",
  color: "#3e86ff",
  backgroundImage: "https://cdn.lucawahlen.com/bedrock_background.jpg",
}

const { user } = await auth.api.signUpEmail({
  body: { email: EMAIL, password: PASSWORD, name: "Dev User" },
})

let [org] = await db
  .select()
  .from(organization)
  .where(eq(organization.slug, ROOT_ORG.slug))
if (!org) {
  ;[org] = await db
    .insert(organization)
    .values({
      id: crypto.randomUUID(),
      ...ROOT_ORG,
      createdAt: new Date(),
      isRoot: true,
    })
    .returning()
}

await db.insert(member).values({
  id: crypto.randomUUID(),
  organizationId: org.id,
  userId: user.id,
  role: "owner",
  createdAt: new Date(),
})

process.exit(0)
