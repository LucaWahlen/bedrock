"use server"

import { and, eq, isNull, sql } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { hasRole, memberHasRole, resolveMutationSubject } from "@/features/auth"
import {
  deliverAfterResponse,
  sendBreakGlassStartedNotice,
} from "@/features/notifications"
import { BREAK_GLASS_MINUTES } from "@/features/organizations/lib/break-glass"
import { createBreakGlassInputSchema } from "@/features/organizations/schemas/break-glass"
import type {
  StartBreakGlassInput,
  StartBreakGlassResult,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { breakGlassGrant, member, user } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

// Root entering an organization as its owner, for a stated reason and a bounded
// time. It exists for what nobody inside can do any more, such as an
// organization that has lost every owner, so every use is audited where both
// root and the organization can see it, and its owners are told by mail.
export async function startBreakGlass(
  input: StartBreakGlassInput
): Promise<StartBreakGlassResult> {
  const t = await getTranslations("organizations")
  const parsed = createBreakGlassInputSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("breakGlass.errors.denied"),
    }
  }

  const resolution = await resolveMutationSubject({
    action: "organization.break_glass_started",
    organizationId: parsed.data.organizationId,
    deniedError: t("breakGlass.errors.denied"),
    target: (resolved) => ({
      type: "organization",
      id: parsed.data.organizationId,
      label: resolved?.name,
    }),
  })
  if (!resolution.authorized) return { success: false, error: resolution.error }

  const { currentUser, organization, membership, rootMembership } =
    resolution.subject
  const deny = async (reason: string, error?: string) => ({
    success: false as const,
    error: (await resolution.subject.deny(reason, error)).error,
  })

  if (!rootMembership) return deny("Instance administration is required")
  if (!currentUser.hasSecondFactor) {
    return deny(
      "A second factor is required for break-glass access",
      t("breakGlass.errors.secondFactorRequired")
    )
  }
  if (organization.isRoot) {
    return deny("The root organization has no break-glass access")
  }
  if (organization.status !== "active") {
    return deny("Organization is not active", t("breakGlass.errors.inactive"))
  }
  if (membership?.breakGlass) {
    return { success: true, slug: organization.slug }
  }
  if (membership && hasRole(membership.role, "owner")) {
    return { success: false, error: t("breakGlass.errors.alreadyOwner") }
  }

  const reason = parsed.data.reason
  const grant = await db.transaction(async (tx) => {
    // A grant that has lapsed but was never ended still holds the one open
    // slot, so it is closed before the new one opens.
    await tx
      .update(breakGlassGrant)
      .set({ endedAt: sql`now()` })
      .where(
        and(
          eq(breakGlassGrant.userId, currentUser.id),
          eq(breakGlassGrant.organizationId, organization.id),
          isNull(breakGlassGrant.endedAt)
        )
      )

    const [created] = await tx
      .insert(breakGlassGrant)
      .values({
        id: crypto.randomUUID(),
        organizationId: organization.id,
        userId: currentUser.id,
        reason,
        expiresAt: sql`now() + make_interval(mins => ${BREAK_GLASS_MINUTES})`,
      })
      .returning({
        id: breakGlassGrant.id,
        expiresAt: breakGlassGrant.expiresAt,
      })
    if (!created) throw new Error("Break-glass grant was not created")

    await recordAuditEvent(
      {
        action: "organization.break_glass_started",
        actor: auditActorFromUser(currentUser, rootMembership.organizationId),
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        target: {
          type: "organization",
          id: organization.id,
          label: organization.name,
        },
        reason,
        metadata: {
          breakGlassGrantId: created.id,
          expiresAt: created.expiresAt.toISOString(),
        },
      },
      tx
    )

    return created
  })

  const owners = await db
    .select({ name: user.name, email: user.email, locale: user.locale })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, organization.id),
        memberHasRole(member.role, "owner")
      )
    )

  deliverAfterResponse(() =>
    Promise.all(
      owners.map((owner) =>
        sendBreakGlassStartedNotice({
          recipient: owner,
          organization,
          actorName: currentUser.name,
          reason,
          expiresAt: grant.expiresAt,
        })
      )
    )
  )

  revalidateEverywhere()

  return { success: true, slug: organization.slug }
}
