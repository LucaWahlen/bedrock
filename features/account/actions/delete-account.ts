"use server"

import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { getFormatter, getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { verifySecondFactor } from "@/features/account/actions/verify-second-factor"
import { deleteUserObjects } from "@/features/account/lib/avatar-storage"
import { findSoleOwnedOrganizations } from "@/features/account/lib/sole-ownership"
import { createDeleteAccountSchema } from "@/features/account/schemas/account"
import type {
  DeleteAccountInput,
  DeleteAccountResult,
} from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendAccountDeletedNotice,
} from "@/features/notifications"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import {
  consumeRateLimit,
  resetRateLimit,
} from "@/features/shared/lib/rate-limit"

const ACCOUNT_SOURCE_LIMIT = { window: 15 * 60, max: 5 }

// Not Better Auth's `deleteUser`: that cannot take the owner locks below inside
// its own write, so it could not keep the last-owner guard under concurrency.
// Deleting the user row cascades to its sessions, credentials, memberships,
// application role assignments, OAuth tokens and consents, and the invitations
// it sent. Audit events reference people by plain columns and stay as written.
export async function deleteAccount(
  input: DeleteAccountInput
): Promise<DeleteAccountResult> {
  const [t, tc, format] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
    getFormatter(),
  ])
  const parsed = createDeleteAccountSchema(t).safeParse(input)
  if (!parsed.success) {
    return { success: false, error: t("validation.currentPasswordRequired") }
  }

  const { user: currentUser } = await getAccessContext()
  if (!currentUser) return { success: false, error: tc("errors.notSignedIn") }

  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const actor = auditActorFromUser(currentUser)
  // The statement: who the account was, written before it stops existing.
  const target = { type: "user", id: currentUser.id, label: currentUser.name }
  const accountSourceKey = `account:delete:${currentUser.id}|${source ?? "unknown"}`

  const throttle = await consumeRateLimit(
    accountSourceKey,
    ACCOUNT_SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    await recordAuditEvent({
      action: "account.deleted",
      outcome: "denied",
      actor,
      target,
      reason: "Too many attempts",
    })

    return {
      success: false,
      error: t("errors.tooManyAttempts", {
        minutes: Math.ceil((throttle.retryAfter ?? 60) / 60),
      }),
    }
  }

  try {
    await auth.api.verifyPassword({
      body: { password: parsed.data.currentPassword },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.deleted",
      outcome: "failure",
      actor,
      target,
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: t("errors.incorrectPassword") }
  }

  // Deleting is the last thing a stolen password should be able to do, so an
  // account with two-factor authentication on proves its second factor too.
  const [account] = await db
    .select({ twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, currentUser.id))
    .limit(1)
  if (account?.twoFactorEnabled) {
    const secondFactor = parsed.data.code
      ? await verifySecondFactor(parsed.data.code)
      : ({
          success: false,
          error: t("validation.secondFactorRequired"),
        } as const)

    if (!secondFactor.success) {
      await recordAuditEvent({
        action: "account.deleted",
        outcome: "failure",
        actor,
        target,
        reason: parsed.data.code
          ? "Invalid second factor"
          : "Second factor missing",
      })

      return { success: false, error: secondFactor.error }
    }
  }

  await resetRateLimit(accountSourceKey)

  const refusal = await db.transaction(async (tx) => {
    const soleOwned = await findSoleOwnedOrganizations(tx, currentUser.id, {
      lock: true,
    })
    if (soleOwned.length > 0) return soleOwned

    await recordAuditEvent(
      {
        action: "account.deleted",
        actor,
        target,
        metadata: { name: currentUser.name, email: currentUser.email },
      },
      tx
    )

    await tx.delete(user).where(eq(user.id, currentUser.id))

    return null
  })

  if (refusal) {
    const error = t("errors.soleOwner", {
      organizations: format.list(
        refusal.map((organization) => organization.name),
        { type: "conjunction" }
      ),
    })

    await recordAuditEvent({
      action: "account.deleted",
      outcome: "denied",
      actor,
      target,
      reason: "Sole owner of an organization",
      metadata: {
        organizations: refusal.map(({ id, name, slug }) => ({
          id,
          name,
          slug,
        })),
      },
    })

    return { success: false, error, soleOwnedOrganizations: refusal }
  }

  // The account is already gone, so neither of these can undo it. Storage is
  // best effort, and the cookie only names a session that no longer exists.
  await deleteUserObjects(currentUser.id).catch((error: unknown) => {
    console.error("Account objects could not be deleted", error)
  })
  await auth.api
    .signOut({ headers: requestHeaders })
    .catch((error: unknown) => {
      console.error("Session cookie could not be cleared", error)
    })
  // To the address the account had: it belongs to nobody here any more.
  await noticeAccountHolder(
    { user: currentUser, memberships: [] },
    sendAccountDeletedNotice
  )

  return { success: true }
}
