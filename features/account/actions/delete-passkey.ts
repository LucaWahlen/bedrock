"use server"

import { APIError } from "better-auth/api"
import { and, count, eq, ne } from "drizzle-orm"
import { getFormatter, getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { getTwoFactorRequirements } from "@/features/account/actions/get-two-factor-requirements"
import { passkeyIdSchema } from "@/features/account/schemas/account"
import { passkeyRemovalRefusal } from "@/features/account/utils/second-factor-requirement"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendPasskeyRemovedNotice,
} from "@/features/notifications"
import { db } from "@/features/shared/lib/db/client"
import { passkey, user as userTable } from "@/features/shared/lib/db/schema"
import type { ActionResult } from "@/features/shared/types"

export async function deletePasskey(id: string): Promise<ActionResult> {
  const [t, tc, format] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
    getFormatter(),
  ])
  const { user, memberships } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsed = passkeyIdSchema.safeParse(id)
  if (!parsed.success) {
    return { success: false, error: t("errors.passkeyNotFound") }
  }

  // Scoped to the caller before anything else, so another account's passkey is
  // indistinguishable from one that does not exist. The plugin checks again.
  // The name is read now because it is what the audit log has to say.
  const [owned] = await db
    .select({ name: passkey.name })
    .from(passkey)
    .where(and(eq(passkey.id, parsed.data), eq(passkey.userId, user.id)))
    .limit(1)
  if (!owned) return { success: false, error: t("errors.passkeyNotFound") }

  // Removing the last factor an organization requires would lock its member
  // out of it.
  const [requiredBy, [account], [others]] = await Promise.all([
    getTwoFactorRequirements(),
    db
      .select({ twoFactorEnabled: userTable.twoFactorEnabled })
      .from(userTable)
      .where(eq(userTable.id, user.id))
      .limit(1),
    db
      .select({ count: count() })
      .from(passkey)
      .where(and(eq(passkey.userId, user.id), ne(passkey.id, parsed.data))),
  ])
  const refusal = passkeyRemovalRefusal(
    {
      twoFactorEnabled: account?.twoFactorEnabled ?? false,
      passkeyCount: 1 + (others?.count ?? 0),
      requiredBy,
    },
    t,
    format
  )
  if (refusal) {
    await recordAuditEvent({
      action: "account.passkey_removed",
      outcome: "denied",
      actor: auditActorFromUser(user),
      target: { type: "passkey", id: parsed.data, label: owned.name },
      reason: "Required by an organization",
      metadata: { requiredBy },
    })

    return { success: false, error: refusal }
  }

  try {
    await auth.api.deletePasskey({
      body: { id: parsed.data },
      headers: await headers(),
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    return { success: false, error: t("errors.passkeyNotRemoved") }
  }

  await recordAuditEvent({
    action: "account.passkey_removed",
    actor: auditActorFromUser(user),
    target: { type: "passkey", id: parsed.data, label: owned.name },
  })
  await noticeAccountHolder({ user, memberships }, (notice) =>
    sendPasskeyRemovedNotice({
      ...notice,
      passkeyName: owned.name ?? t("passkeys.unnamed"),
    })
  )

  return { success: true }
}
