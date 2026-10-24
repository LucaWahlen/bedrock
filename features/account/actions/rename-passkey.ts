"use server"

import { APIError } from "better-auth/api"
import { and, eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { createRenamePasskeySchema } from "@/features/account/schemas/account"
import type { RenamePasskeyInput } from "@/features/account/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { passkey } from "@/features/shared/lib/db/schema"
import type { ActionResult } from "@/features/shared/types"

export async function renamePasskey(
  input: RenamePasskeyInput
): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const { user } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsed = createRenamePasskeySchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error:
        parsed.error.issues[0]?.message ?? t("validation.passkeyNameRequired"),
    }
  }

  // Scoped to the caller before anything else, so another account's passkey is
  // indistinguishable from one that does not exist. The plugin checks again.
  const [owned] = await db
    .select({ name: passkey.name })
    .from(passkey)
    .where(and(eq(passkey.id, parsed.data.id), eq(passkey.userId, user.id)))
    .limit(1)
  if (!owned) return { success: false, error: t("errors.passkeyNotFound") }

  try {
    await auth.api.updatePasskey({
      body: { id: parsed.data.id, name: parsed.data.name },
      headers: await headers(),
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    return { success: false, error: t("errors.passkeyNotRenamed") }
  }

  await recordAuditEvent({
    action: "account.passkey_renamed",
    actor: auditActorFromUser(user),
    target: { type: "passkey", id: parsed.data.id, label: parsed.data.name },
    metadata: { previousName: owned.name },
  })

  return { success: true }
}
