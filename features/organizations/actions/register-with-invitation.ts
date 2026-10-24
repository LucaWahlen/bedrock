"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth"
import { claimInvitation } from "@/features/organizations/lib/claim-invitation"
import { invitationRefusalMessage } from "@/features/organizations/lib/invitation-display"
import { resolveInvitationByToken } from "@/features/organizations/lib/resolve-invitation"
import { createAccountDetailsSchema } from "@/features/organizations/schemas/invitation"
import type {
  AcceptInvitationResult,
  AccountDetailsInput,
} from "@/features/organizations/types"
import { clientAddress } from "@/features/shared/lib/client-address"
import { checkPasswordAgainstBreaches } from "@/features/shared/lib/pwned-passwords"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"

const REGISTER_LIMIT = { window: 60 * 60, max: 10 }

/**
 * The only path that creates an account outside the bootstrap script and public
 * sign-up. The address is already proven by the token, so the new account is
 * verified on creation rather than mailed a second link.
 */
export async function registerWithInvitation(
  token: string,
  details: AccountDetailsInput
): Promise<AcceptInvitationResult> {
  const parsed = await createAccountDetailsSchema(
    await getTranslations("organizations")
  ).safeParseAsync(details)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Check the details you entered",
    }
  }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)

  // Judged with the rest of the password's quality, before this caller's
  // registration budget is touched: being told to pick a better password is
  // not an attempt at accepting the invitation.
  const breach = await checkPasswordAgainstBreaches(
    parsed.data.password,
    source
  )
  if (!breach.ok) return { success: false, error: breach.error }

  const throttle = await consumeRateLimit(
    `invitation:register:${source ?? "unknown"}`,
    REGISTER_LIMIT
  )
  if (!throttle.allowed) {
    return { success: false, error: "Too many attempts. Try again later." }
  }

  const resolution = await resolveInvitationByToken(token)
  if (!resolution.ok) {
    return {
      success: false,
      error: invitationRefusalMessage(
        await getTranslations("organizations"),
        resolution.refusal
      ),
    }
  }

  const invited = resolution.invitation
  if (invited.recipientUserId) {
    return {
      success: false,
      error: "That address already has an account. Sign in to accept.",
    }
  }

  const auditedOrganization = {
    id: invited.organization.id,
    name: invited.organization.name,
    slug: invited.organization.slug,
  }

  let createdUser: { id: string; name: string; email: string }
  try {
    const signUp = await auth.api.signUpEmail({
      body: {
        name: parsed.data.name,
        email: invited.email,
        password: parsed.data.password,
      },
      headers: requestHeaders,
    })
    createdUser = signUp.user
  } catch (error) {
    await recordAuditEvent({
      action: "user.created",
      outcome: "failure",
      actor: { type: "anonymous", email: invited.email },
      organization: auditedOrganization,
      reason:
        error instanceof APIError
          ? (error.body?.message ?? error.message)
          : "Unexpected error",
    })

    if (!(error instanceof APIError)) throw error

    return { success: false, error: "That account could not be created" }
  }

  const actor = auditActorFromUser(createdUser)

  // Better Auth commits the account through its own connection, so this was
  // never atomic with the claim below and is not pretended to be.
  await recordAuditEvent({
    action: "user.created",
    actor,
    organization: auditedOrganization,
    target: { type: "user", id: createdUser.id, label: createdUser.name },
    metadata: { via: "invitation" },
  })

  const claimed = await claimInvitation({
    invited,
    claimant: createdUser,
    via: "registration",
  })

  if (!claimed) {
    // The account exists either way, so the person is told what they now have
    // rather than left thinking nothing happened.
    return {
      success: false,
      error:
        "Your account was created, but that invitation was already used. Sign in instead.",
    }
  }

  return { success: true, slug: invited.organization.slug }
}
