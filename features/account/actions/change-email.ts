"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createChangeEmailSchema } from "@/features/account/schemas/account"
import type { ChangeEmailInput } from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendEmailChangeRequestedNotice,
} from "@/features/notifications"
import { clientAddress } from "@/features/shared/lib/client-address"
import { env } from "@/features/shared/lib/config/env"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

// Mails are not free, and each request sends one to an address the caller
// chose. Kept per account so nobody can turn this into a way to mail strangers.
const ACCOUNT_LIMIT = { window: 60 * 60, max: 10 }

export async function changeEmail(
  input: ChangeEmailInput,
  organizationSlug: string
): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const parsed = createChangeEmailSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("validation.emailInvalid"),
    }
  }

  const access = await getAccessContext()
  const user = access.user
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const { newEmail, currentPassword } = parsed.data
  if (newEmail === user.email.toLowerCase()) {
    return { success: false, error: t("errors.sameEmail") }
  }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const actor = auditActorFromUser(user)
  const target = { type: "user", id: user.id, label: user.name }
  const accountSourceKey = `account:email:${user.id}|${source ?? "unknown"}`

  const attempts = await Promise.all([
    consumeRateLimit(accountSourceKey, ACCOUNT_SOURCE_LIMIT),
    consumeRateLimit(`account:email:${user.id}`, ACCOUNT_LIMIT),
  ])
  const blocked = attempts.find((attempt) => !attempt.allowed)
  if (blocked) {
    await recordAuditEvent({
      action: "account.email_change_requested",
      outcome: "denied",
      actor,
      target,
      reason: "Too many attempts",
    })

    return {
      success: false,
      error: t("errors.tooManyAttempts", {
        minutes: Math.ceil((blocked.retryAfter ?? 60) / 60),
      }),
    }
  }

  // The link is branded for, and comes back to, the organization the request
  // came from, but only one the person belongs to. Anything else falls back to
  // the instance rather than echoing a caller's string into a mail.
  const slug =
    access.memberships.find(
      (membership) => membership.slug === organizationSlug
    )?.slug ?? env.rootOrganization.slug

  try {
    // Better Auth only checks the session; whoever holds it must also still
    // know the password before the account can be pointed at another inbox.
    await auth.api.verifyPassword({
      body: { password: currentPassword },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.email_change_requested",
      outcome: "failure",
      actor,
      target,
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: t("errors.incorrectPassword") }
  }

  await resetRateLimit(accountSourceKey)

  try {
    // Nothing changes yet. The link goes to the new address, and the address
    // is only replaced once it is followed. An address that already belongs to
    // someone gets no mail, but the answer here is the same either way.
    await auth.api.changeEmail({
      body: { newEmail, callbackURL: `/org/${slug}` },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.email_change_requested",
      outcome: "failure",
      actor,
      target,
      reason: error.body?.message ?? error.message,
      metadata: { requestedEmail: newEmail },
    })

    return { success: false, error: t("errors.emailNotChanged") }
  }

  await recordAuditEvent({
    action: "account.email_change_requested",
    actor,
    target,
    metadata: { requestedEmail: newEmail },
  })
  // To the address still on the account, which is the one at risk.
  await noticeAccountHolder(
    { user, memberships: access.memberships, preferredSlug: slug },
    (notice) => sendEmailChangeRequestedNotice({ ...notice, newEmail })
  )

  return { success: true }
}
