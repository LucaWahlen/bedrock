"use server"

import { getTranslations } from "next-intl/server"

import { recordAuditEvent } from "@/features/audit"
import {
  deliverAfterResponse,
  sendAccountDisabledNotice,
} from "@/features/notifications"
import {
  changeAccountStanding,
  isRootOwner,
} from "@/features/organizations/lib/account-standing"
import { authorizeAccountStanding } from "@/features/organizations/lib/standing-authorization"
import { createDisableAccountInputSchema } from "@/features/organizations/schemas/account-standing"
import type {
  DisableAccountInput,
  DisableAccountResult,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

// A root administrator shuts an account out of the whole instance: every
// session, token and consent goes with it, and no sign-in path lets it back in
// until it is enabled again. Memberships are kept, so enabling restores them.
export async function disableAccount(
  input: DisableAccountInput
): Promise<DisableAccountResult> {
  const parsed = createDisableAccountInputSchema(
    await getTranslations("organizations")
  ).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    }
  }
  const { userId, reason } = parsed.data

  const authorization = await authorizeAccountStanding("user.disabled", userId)
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }
  const { actor, actorUserId, actorIsRootOwner } = authorization

  async function deny(why: string, error: string) {
    await recordAuditEvent({
      action: "user.disabled",
      outcome: "denied",
      actor,
      target: { type: "user", id: userId },
      reason: why,
    })

    return { success: false as const, error }
  }

  // Nobody locks themselves out from inside the product; that is what another
  // administrator, or `bun run admin`, is for.
  if (userId === actorUserId) {
    return deny(
      "Tried to disable their own account",
      "You cannot disable your own account"
    )
  }

  if (!actorIsRootOwner && (await isRootOwner(db, userId))) {
    return deny(
      "Root ownership is required to disable a root owner",
      "Only a root owner can disable another root owner"
    )
  }

  const change = await db.transaction((tx) =>
    changeAccountStanding(tx, {
      userId,
      disable: { reason },
      actor,
      disabledBy: actorUserId,
    })
  )

  if (!change.ok) {
    await recordAuditEvent({
      action: "user.disabled",
      outcome: "denied",
      actor,
      target: {
        type: "user",
        id: userId,
        label: change.target?.name ?? null,
      },
      reason: change.error,
      ...(change.target && {
        metadata: { name: change.target.name, email: change.target.email },
      }),
    })

    return { success: false, error: change.error }
  }

  deliverAfterResponse(() =>
    sendAccountDisabledNotice({
      recipient: { name: change.target.name, email: change.target.email },
      reason,
    })
  )

  revalidateEverywhere()

  return {
    success: true,
    soleOwnedOrganizations: change.soleOwnedOrganizations,
  }
}
