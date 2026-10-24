import { and, asc, eq, like } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth/lib/auth"
import { changeAccountStanding } from "@/features/organizations/lib/account-standing"
import { db } from "@/features/shared/lib/db/client"
import { twoFactor, user, verification } from "@/features/shared/lib/db/schema"

const SYSTEM_ACTOR = { type: "system" } as const

export function listUsers() {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .orderBy(asc(user.email))
    .limit(200)
}

export async function createUser(input: {
  name: string
  email: string
  password: string
}) {
  const { user: created } = await auth.api.signUpEmail({ body: input })

  // Created by someone with shell access to the deployment, so the address is
  // vouched for already and the account is usable immediately.
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, created.id))

  await recordAuditEvent({
    action: "user.created",
    actor: SYSTEM_ACTOR,
    target: { type: "user", id: created.id, label: created.email },
    reason: "Created with the admin script",
  })

  return created
}

export type TwoFactorReset = { ok: true } | { ok: false; error: string }

// Recovery for someone who has lost both their authenticator and their backup
// codes. Done from a shell, never the web application: whoever can run this
// already controls the deployment, which no session in the product does. Every
// device trusted to skip the second factor is forgotten with it, so the
// account's next sign-in is a plain password sign-in, and they can enrol again.
export async function resetTwoFactor(target: {
  id: string
  name: string
  email: string
}): Promise<TwoFactorReset> {
  const reset = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(eq(user.id, target.id))
      .returning({ id: user.id })
    if (!updated) return false

    await tx.delete(twoFactor).where(eq(twoFactor.userId, target.id))
    // Trusted devices, and any sign-in halfway through its second step.
    await tx
      .delete(verification)
      .where(
        and(
          eq(verification.value, target.id),
          like(verification.identifier, "trust-device-%")
        )
      )
    await tx
      .delete(verification)
      .where(
        and(
          eq(verification.value, target.id),
          like(verification.identifier, "2fa-%")
        )
      )

    await recordAuditEvent(
      {
        action: "account.two_factor_reset",
        actor: SYSTEM_ACTOR,
        target: { type: "user", id: target.id, label: target.name },
        reason: "Reset with the admin script",
        metadata: { email: target.email },
      },
      tx
    )

    return true
  })

  return reset
    ? { ok: true }
    : { ok: false, error: "That user no longer exists" }
}

export async function findUserByEmail(email: string) {
  const [found] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1)

  return found ?? null
}

export type AccountStandingResult =
  | { ok: true; soleOwnerOf: string[] }
  | { ok: false; error: string }

// Disabling from a shell follows the same rules as the Directory, including
// keeping one active root owner, and is audited as the system. Like the web
// action it ends every session, token and consent in the same transaction.
export async function disableUser(
  target: { id: string },
  reason: string
): Promise<AccountStandingResult> {
  const change = await db.transaction((tx) =>
    changeAccountStanding(tx, {
      userId: target.id,
      disable: { reason },
      actor: SYSTEM_ACTOR,
      disabledBy: null,
      metadata: { via: "admin script" },
    })
  )

  return change.ok
    ? {
        ok: true,
        soleOwnerOf: change.soleOwnedOrganizations.map(
          (organization) => organization.slug
        ),
      }
    : { ok: false, error: change.error }
}

export async function enableUser(target: {
  id: string
}): Promise<AccountStandingResult> {
  const change = await db.transaction((tx) =>
    changeAccountStanding(tx, {
      userId: target.id,
      disable: null,
      actor: SYSTEM_ACTOR,
      disabledBy: null,
      metadata: { via: "admin script" },
    })
  )

  return change.ok
    ? { ok: true, soleOwnerOf: [] }
    : { ok: false, error: change.error }
}
