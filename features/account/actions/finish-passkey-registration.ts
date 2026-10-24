"use server"

import { APIError } from "better-auth/api"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import {
  createPasskeyNameSchema,
  passkeyRegistrationResponseSchema,
} from "@/features/account/schemas/account"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth, getAccessContext } from "@/features/auth"
import {
  noticeAccountHolder,
  sendPasskeyAddedNotice,
} from "@/features/notifications"
import type { ActionResult } from "@/features/shared/types"

/**
 * Stores the passkey the browser just created, once the plugin has checked it
 * answers the challenge `startPasskeyRegistration` issued to this account. The
 * plugin attributes it to the session's own user and refuses a challenge that
 * was issued to anyone else.
 */
export async function finishPasskeyRegistration(
  name: string,
  credential: unknown
): Promise<ActionResult> {
  const [t, tc] = await Promise.all([
    getTranslations("account"),
    getTranslations("common"),
  ])
  const { user, memberships } = await getAccessContext()
  if (!user) return { success: false, error: tc("errors.notSignedIn") }

  const parsedName = createPasskeyNameSchema(t).safeParse(name)
  if (!parsedName.success) {
    return {
      success: false,
      error:
        parsedName.error.issues[0]?.message ??
        t("validation.passkeyNameRequired"),
    }
  }

  const parsedCredential =
    passkeyRegistrationResponseSchema.safeParse(credential)
  if (!parsedCredential.success) {
    return { success: false, error: t("errors.passkeyNotAdded") }
  }

  const actor = auditActorFromUser(user)

  try {
    const created = await auth.api.verifyPasskeyRegistration({
      body: { response: parsedCredential.data, name: parsedName.data },
      headers: await headers(),
    })

    await recordAuditEvent({
      action: "account.passkey_added",
      actor,
      target: { type: "passkey", id: created.id, label: parsedName.data },
      metadata: {
        deviceType: created.deviceType,
        backedUp: created.backedUp,
      },
    })
    await noticeAccountHolder({ user, memberships }, (notice) =>
      sendPasskeyAddedNotice({ ...notice, passkeyName: parsedName.data })
    )

    return { success: true }
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "account.passkey_added",
      outcome: "failure",
      actor,
      target: { type: "user", id: user.id, label: user.name },
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: t("errors.passkeyNotAdded") }
  }
}
