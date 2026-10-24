"use server"

import { APIError } from "better-auth/api"
import { and, eq, sql } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth/lib/auth"
import { organizationCallback } from "@/features/auth/lib/email-links"
import { createSignUpSchema } from "@/features/auth/schemas/sign-up"
import type { SignUpInput } from "@/features/auth/types"
import { getOrganizationBySlug } from "@/features/organizations"
import { isOpenToAnyone } from "@/features/organizations"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import {
  invitation,
  member,
  organization,
} from "@/features/shared/lib/db/schema"
import { checkPasswordAgainstBreaches } from "@/features/shared/lib/pwned-passwords"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const SOURCE_LIMIT = { window: 60 * 60, max: 10 }

/**
 * Self-service registration, which an organization has to have opened. It never
 * applies to root: administering the instance is granted, never claimed.
 */
export async function signUp(
  input: SignUpInput,
  organizationSlug: string
): Promise<ActionResult> {
  const t = await getTranslations("auth")
  const parsed = await createSignUpSchema(t).safeParseAsync(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.checkDetails"),
    }
  }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)

  // Judged with the rest of the password's quality, before this caller's
  // sign-up budget is touched: being told to pick a better password is not an
  // attempt at creating an account, and a weak one already costs nothing.
  const breach = await checkPasswordAgainstBreaches(
    parsed.data.password,
    source
  )
  if (!breach.ok) return { success: false, error: breach.error }

  const throttle = await consumeRateLimit(
    `sign-up:source:${source ?? "unknown"}`,
    SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    return {
      success: false,
      error: t("errors.tooManyRequests", {
        minutes: Math.ceil((throttle.retryAfter ?? 60) / 60),
      }),
    }
  }

  const target = await getOrganizationBySlug(organizationSlug)

  // Re-read from the organization rather than trusted from the page that
  // rendered the form, and refused identically whether it is closed or absent
  // so the two are not distinguishable.
  if (!target || !isOpenToAnyone(target)) {
    return { success: false, error: t("errors.invitationOnly") }
  }

  const auditedOrganization = {
    id: target.id,
    name: target.name,
    slug: target.slug,
  }
  const email = parsed.data.email.toLowerCase()

  try {
    const signUpResult = await auth.api.signUpEmail({
      body: { name: parsed.data.name, email, password: parsed.data.password },
      headers: requestHeaders,
    })
    const createdUser = signUpResult.user
    // Self-service, so no organization authority was used to do it.
    const actor = auditActorFromUser(createdUser)

    const joined = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: organization.id,
          isRoot: organization.isRoot,
          status: organization.status,
          allowPublicSignUp: organization.allowPublicSignUp,
        })
        .from(organization)
        .where(eq(organization.id, target.id))
        .for("update")
        .limit(1)

      await recordAuditEvent(
        {
          action: "user.created",
          actor,
          organization: auditedOrganization,
          target: { type: "user", id: createdUser.id, label: createdUser.name },
          metadata: { via: "sign-up" },
        },
        tx
      )

      if (!current || !isOpenToAnyone(current)) return false

      const [createdMembership] = await tx
        .insert(member)
        .values({
          id: crypto.randomUUID(),
          organizationId: current.id,
          userId: createdUser.id,
          role: "member",
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: [member.organizationId, member.userId] })
        .returning({ id: member.id })

      await tx
        .delete(invitation)
        .where(
          and(
            eq(invitation.organizationId, current.id),
            eq(sql`lower(${invitation.email})`, createdUser.email.toLowerCase())
          )
        )

      if (createdMembership) {
        await recordAuditEvent(
          {
            action: "organization.member_added",
            actor,
            organization: auditedOrganization,
            target: {
              type: "user",
              id: createdUser.id,
              label: createdUser.name,
            },
            metadata: { role: "member", via: "sign-up" },
          },
          tx
        )
      }

      return true
    })

    // The callback carries the organization, which is how the mail knows whose
    // branding to wear and where the link should land.
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: organizationCallback(target.slug) },
      headers: requestHeaders,
    })

    if (!joined) {
      return { success: false, error: t("errors.signUpsClosed") }
    }

    return { success: true }
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "user.created",
      outcome: "failure",
      actor: { type: "anonymous", email },
      organization: auditedOrganization,
      reason: error.body?.message ?? error.message,
    })

    // Deliberately generic: a distinct message here would confirm which
    // addresses already hold an account.
    return { success: false, error: t("errors.accountNotCreated") }
  }
}
