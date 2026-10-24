"use server"

import { z } from "zod"

import { recordAuditEvent } from "@/features/audit"
import {
  deliverAfterResponse,
  sendAccountEnabledNotice,
} from "@/features/notifications"
import {
  changeAccountStanding,
  isRootOwner,
} from "@/features/organizations/lib/account-standing"
import { authorizeAccountStanding } from "@/features/organizations/lib/standing-authorization"
import { db } from "@/features/shared/lib/db/client"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

// Lets a disabled account sign in again, with every membership it had. Nothing
// it lost when it was disabled, such as a session or a token, comes back.
export async function enableAccount(userId: string): Promise<ActionResult> {
  const parsed = z.string().min(1).safeParse(userId)
  if (!parsed.success) return { success: false, error: "Invalid request" }

  const authorization = await authorizeAccountStanding(
    "user.enabled",
    parsed.data
  )
  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }
  const { actor, actorUserId, actorIsRootOwner } = authorization

  if (!actorIsRootOwner && (await isRootOwner(db, parsed.data))) {
    await recordAuditEvent({
      action: "user.enabled",
      outcome: "denied",
      actor,
      target: { type: "user", id: parsed.data },
      reason: "Root ownership is required to enable a root owner",
    })

    return {
      success: false,
      error: "Only a root owner can enable another root owner",
    }
  }

  const change = await db.transaction((tx) =>
    changeAccountStanding(tx, {
      userId: parsed.data,
      disable: null,
      actor,
      disabledBy: actorUserId,
    })
  )

  if (!change.ok) return { success: false, error: change.error }

  deliverAfterResponse(() =>
    sendAccountEnabledNotice({
      recipient: { name: change.target.name, email: change.target.email },
    })
  )

  revalidateEverywhere()

  return { success: true }
}
