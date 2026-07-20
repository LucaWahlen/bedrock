import { and, eq, sql } from "drizzle-orm"

import { auth } from "@/features/auth"
import { db } from "@/features/shared/lib/db"
import {
  member,
  organization,
  user,
} from "@/features/shared/lib/schema"

const INITIAL_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  password: process.env.SEED_ADMIN_PASSWORD || "admin123",
  name: process.env.SEED_ADMIN_NAME || "Admin",
}

const ROOT_ORGANIZATION = {
  name: "Bedrock",
  slug: "bedrock",
  logo: "https://cdn.lucawahlen.com/bedrock-logo.svg",
  color: "#3e86ff",
}

export async function ensureInitialSetup() {
  await db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(1876398541)`)

    let [rootOrganization] = await transaction
      .select()
      .from(organization)
      .where(eq(organization.isRoot, true))
      .limit(1)

    if (!rootOrganization) {
      ;[rootOrganization] = await transaction
        .insert(organization)
        .values({
          id: crypto.randomUUID(),
          ...ROOT_ORGANIZATION,
          backgroundImage: null,
          createdAt: new Date(),
          isRoot: true,
        })
        .returning()
    } else {
      ;[rootOrganization] = await transaction
        .update(organization)
        .set({
          ...ROOT_ORGANIZATION,
          backgroundImage: null,
        })
        .where(eq(organization.id, rootOrganization.id))
        .returning()
    }

    const [admin] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, INITIAL_ADMIN.email))
      .limit(1)
    let adminId = admin?.id

    if (!adminId) {
      const result = await auth.api.signUpEmail({ body: INITIAL_ADMIN })
      adminId = result.user.id
    }

    const [ownerMembership] = await transaction
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, rootOrganization.id),
          eq(member.userId, adminId)
        )
      )
      .limit(1)

    if (!ownerMembership) {
      await transaction.insert(member).values({
        id: crypto.randomUUID(),
        organizationId: rootOrganization.id,
        userId: adminId,
        role: "owner",
        createdAt: new Date(),
      })
    }
  })
}