"use server"

import { APIError } from "better-auth/api"
import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { recordAuditEvent } from "@/features/audit"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { auth } from "@/features/auth/lib/auth"
import { emailChangeOf } from "@/features/auth/utils/email-change-token"
import {
  noticeAccountHolder,
  sendEmailChangedNotice,
} from "@/features/notifications"
import { clientAddress } from "@/features/shared/lib/client-address"
import { db } from "@/features/shared/lib/db/client"
import { user } from "@/features/shared/lib/db/schema"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import type { ActionResult } from "@/features/shared/types"

const SOURCE_LIMIT = { window: 60 * 60, max: 30 }

export async function verifyEmail(token: string): Promise<ActionResult> {
  const t = await getTranslations("auth")
  const requestHeaders = await headers()
  const source = clientAddress(requestHeaders)
  const throttle = await consumeRateLimit(
    `email-verification:redeem:${source ?? "unknown"}`,
    SOURCE_LIMIT
  )
  if (!throttle.allowed) {
    return { success: false, error: t("errors.tooManyRequestsLater") }
  }

  try {
    // No `callbackURL`: the redirect is this application's decision, and
    // passing one makes Better Auth answer with a redirect instead of a result.
    await auth.api.verifyEmail({ query: { token }, headers: requestHeaders })

    // Whoever followed the link is usually the signed-in visitor being held at
    // the gate. When they are not, the event still records that it happened.
    const { user: verified, memberships } = await getAccessContext()
    const change = emailChangeOf(token)

    // A link that moves an account to a new address is the end of a change the
    // account itself asked for, so it is recorded as that rather than as a
    // first confirmation. The statement is both addresses as they were.
    if (change) {
      // Following the link from another browser signs that browser in, but
      // only on the response, so the account is found by its new address.
      const [changed] = verified
        ? [verified]
        : await db
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(eq(user.email, change.to))
            .limit(1)

      await recordAuditEvent({
        action: "account.email_changed",
        actor: changed
          ? {
              type: "user",
              userId: changed.id,
              name: changed.name,
              email: change.from,
            }
          : { type: "anonymous", email: change.from },
        target: changed
          ? { type: "user", id: changed.id, label: changed.name }
          : undefined,
        metadata: { from: change.from, to: change.to },
      })
      // To the address the account just left, the one that would not
      // otherwise hear about it.
      if (changed) {
        await noticeAccountHolder(
          {
            user: { name: changed.name, email: change.from },
            memberships: verified ? memberships : [],
          },
          (notice) => sendEmailChangedNotice({ ...notice, newEmail: change.to })
        )
      }

      return { success: true }
    }

    await recordAuditEvent({
      action: "authentication.email_verified",
      actor: verified
        ? {
            type: "user",
            userId: verified.id,
            name: verified.name,
            email: verified.email,
          }
        : { type: "anonymous" },
      target: verified ? { type: "user", id: verified.id } : undefined,
    })

    return { success: true }
  } catch (error) {
    if (!(error instanceof APIError)) throw error

    await recordAuditEvent({
      action: "authentication.email_verified",
      outcome: "failure",
      actor: { type: "anonymous" },
      reason: error.body?.message ?? error.message,
    })

    return { success: false, error: t("errors.confirmationExpired") }
  }
}
