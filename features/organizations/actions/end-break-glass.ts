"use server"

import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { getAccessContext, rootAdministration } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { breakGlassGrant, organization } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// Ends the caller's own open grant early. Anyone may close what they opened,
// even after losing root, so this asks for nothing but the grant itself.
export async function endBreakGlass(
  organizationId: string
): Promise<ActionResult> {
  const t = await getTranslations("organizations")
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser || typeof organizationId !== "string") {
    return { success: false, error: t("breakGlass.errors.notActive") }
  }

  const ended = await db.transaction(async (tx) => {
    const [grant] = await tx
      .update(breakGlassGrant)
      .set({ endedAt: sql`now()` })
      .where(
        and(
          eq(breakGlassGrant.userId, currentUser.id),
          eq(breakGlassGrant.organizationId, organizationId),
          isNull(breakGlassGrant.endedAt),
          gt(breakGlassGrant.expiresAt, sql`now()`)
        )
      )
      .returning({ id: breakGlassGrant.id })
    if (!grant) return false

    const [subject] = await tx
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)

    await recordAuditEvent(
      {
        action: "organization.break_glass_ended",
        actor: auditActorFromUser(
          currentUser,
          rootAdministration(access)?.organizationId ?? null
        ),
        organization: subject,
        target: {
          type: "organization",
          id: organizationId,
          label: subject?.name,
        },
        metadata: { breakGlassGrantId: grant.id },
      },
      tx
    )

    return true
  })

  if (!ended) return { success: false, error: t("breakGlass.errors.notActive") }

  revalidateEverywhere()

  return { success: true }
}
