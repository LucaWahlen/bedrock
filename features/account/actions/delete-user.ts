"use server"

import { eq } from "drizzle-orm"
import { getFormatter, getTranslations } from "next-intl/server"

import { deleteUserObjects } from "@/features/account/lib/avatar-storage"
import { findSoleOwnedOrganizations } from "@/features/account/lib/sole-ownership"
import type { DeleteUserResult } from "@/features/account/types"
import { recordAuditEvent } from "@/features/audit"
import { authorizeUserAdministration } from "@/features/auth"
import {
  noticeAccountHolder,
  sendAccountDeletedNotice,
} from "@/features/notifications"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

// The same deletion a person can make of their own account, made by root: the
// user row goes, and with it every session, credential, membership and token.
// An account that is the last owner of an organization is refused, under the
// same row locks member removal takes, so no organization is left ownerless.
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  const [t, format] = await Promise.all([
    getTranslations("organizations.userAdmin.errors"),
    getFormatter(),
  ])
  const authorization = await authorizeUserAdministration({
    action: "user.deleted",
    userId,
    requireSecondFactor: true,
    errors: {
      denied: t("denied"),
      secondFactor: t("secondFactor"),
      rootMember: t("rootMember"),
    },
  })
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { actor, target } = authorization
  const statement = { type: "user", id: target.id, label: target.name }

  const refusal = await db.transaction(async (tx) => {
    const soleOwned = await findSoleOwnedOrganizations(tx, target.id, {
      lock: true,
    })
    if (soleOwned.length > 0) return soleOwned

    await recordAuditEvent(
      {
        action: "user.deleted",
        actor,
        target: statement,
        metadata: { name: target.name, email: target.email },
      },
      tx
    )
    await tx.delete(user).where(eq(user.id, target.id))

    return null
  })

  if (refusal) {
    await recordAuditEvent({
      action: "user.deleted",
      outcome: "denied",
      actor,
      target: statement,
      reason: "Sole owner of an organization",
      metadata: { organizations: refusal },
    })

    return {
      success: false,
      error: t("soleOwner", {
        organizations: format.list(
          refusal.map((organization) => organization.name),
          { type: "conjunction" }
        ),
      }),
      soleOwnedOrganizations: refusal,
    }
  }

  await deleteUserObjects(target.id).catch((error: unknown) => {
    console.error("Deleted user's stored objects were not removed", error)
  })
  // To the address the account had: it belongs to nobody here any more.
  await noticeAccountHolder(
    { user: { name: target.name, email: target.email }, memberships: [] },
    sendAccountDeletedNotice
  )

  revalidateEverywhere()

  return { success: true }
}
