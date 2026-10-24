"use server"

import { and, eq, sql } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth"
import { uploadShippedBranding } from "@/features/organizations/lib/branding-storage"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { member, organization, user } from "@/features/shared/lib/db/schema"

const SYSTEM_ACTOR = { type: "system" } as const

// One writer at a time across replicas. The id is arbitrary but must be stable.
const SETUP_LOCK = sql`select pg_advisory_xact_lock(1876398541)`

async function ensureRootOrganization() {
  return db.transaction(async (transaction) => {
    await transaction.execute(SETUP_LOCK)

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
          ...env.rootOrganization,
          createdAt: new Date(),
          isRoot: true,
        })
        .returning()

      await recordAuditEvent(
        {
          action: "organization.created",
          actor: SYSTEM_ACTOR,
          organization: {
            id: rootOrganization.id,
            name: rootOrganization.name,
            slug: rootOrganization.slug,
          },
          target: {
            type: "organization",
            id: rootOrganization.id,
            label: rootOrganization.name,
          },
          reason: "Root organization created during initial setup",
        },
        transaction
      )
    }

    // Configuration seeds the row once and is deliberately ignored afterwards.
    // Root's identity is not the product's to change either, so correcting it
    // is `bun run admin`, outside the web application.
    return rootOrganization
  })
}

// Branding needs the organization's own id, so it follows creation rather than
// being part of it, exactly as it does for a tenant. Each field backfills on
// its own, so a deployment that already has a logo still gains a background.
async function ensureRootBranding(
  rootOrganization: Pick<
    typeof organization.$inferSelect,
    "id" | "logo" | "backgroundImage" | "favicon"
  >
) {
  const missing = env.shippedBranding.filter(
    ({ field }) => !rootOrganization[field]
  )
  if (missing.length === 0) return

  // Branding is cosmetic and every boot retries it, so storage or the shipped
  // files being unavailable degrades to a missing logo, never a failed boot.
  try {
    const uploaded = await uploadShippedBranding(rootOrganization.id, missing)

    await db
      .update(organization)
      .set(
        Object.fromEntries(uploaded.map((item) => [item.field, item.publicUrl]))
      )
      .where(eq(organization.id, rootOrganization.id))
  } catch (error) {
    console.warn(
      "Root organization branding could not be uploaded; the next boot retries it.",
      error
    )
  }
}

async function findInitialAdminId() {
  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, env.initialAdmin.email))
    .limit(1)

  return admin?.id ?? null
}

// Better Auth writes through its own connection, so this cannot take part in a
// transaction. The unique email is what makes a concurrent boot safe instead.
async function ensureInitialAdmin() {
  const existingId = await findInitialAdminId()
  if (existingId) return existingId

  let adminId: string
  try {
    const result = await auth.api.signUpEmail({ body: env.initialAdmin })
    adminId = result.user.id
  } catch (error) {
    const racedId = await findInitialAdminId()
    if (!racedId) throw error

    return racedId
  }

  // Nothing has been configured to send mail at first boot, and the address
  // came from the deployment rather than from a visitor. Making the bootstrap
  // administrator prove it would lock the instance out of itself.
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, adminId))

  await recordAuditEvent({
    action: "user.created",
    actor: SYSTEM_ACTOR,
    target: {
      type: "user",
      id: adminId,
      label: env.initialAdmin.email,
    },
    reason: "Initial administrator created during initial setup",
  })

  return adminId
}

async function ensureRootOwner(
  rootOrganization: { id: string; name: string; slug: string },
  adminId: string
) {
  await db.transaction(async (transaction) => {
    await transaction.execute(SETUP_LOCK)

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

    if (ownerMembership) return

    await transaction.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: rootOrganization.id,
      userId: adminId,
      role: "owner",
      createdAt: new Date(),
    })

    await recordAuditEvent(
      {
        action: "organization.member_added",
        actor: SYSTEM_ACTOR,
        organization: {
          id: rootOrganization.id,
          name: rootOrganization.name,
          slug: rootOrganization.slug,
        },
        target: {
          type: "user",
          id: adminId,
          label: env.initialAdmin.email,
        },
        metadata: { role: "owner" },
        reason: "Initial owner added during initial setup",
      },
      transaction
    )
  })
}

export async function ensureInitialSetup() {
  const rootOrganization = await ensureRootOrganization()

  await ensureRootBranding(rootOrganization)

  const adminId = await ensureInitialAdmin()

  await ensureRootOwner(rootOrganization, adminId)
}
