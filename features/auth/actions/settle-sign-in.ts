"use server"

import { and, eq, gt, ne } from "drizzle-orm"

import type { SignInDecision } from "@/features/auth/types"
import { decideSignIn } from "@/features/auth/utils/sign-in-gate"
import { db } from "@/features/shared/lib/db/client"
import {
  invitation,
  member,
  organization,
  session,
  user,
} from "@/features/shared/lib/db/schema"

/**
 * The gate's reads and its one write. Nothing is taken on trust: the person is
 * whoever the live session behind `sessionToken` belongs to, so a caller can
 * only ever learn about, or end, a session it already holds. A refusal deletes
 * that session, which is what keeps a refused sign-in from being a sign-in.
 *
 * Not the access context: the new session cookie is on the response, not on the
 * request the calling action was given.
 */
export async function settleSignIn(
  sessionToken: string,
  organizationId: string
): Promise<SignInDecision> {
  const [signedIn] = await db
    .select({ userId: user.id, email: user.email })
    .from(session)
    .innerJoin(user, eq(user.id, session.userId))
    .where(
      and(eq(session.token, sessionToken), gt(session.expiresAt, new Date()))
    )
    .limit(1)
  if (!signedIn) {
    return {
      allowed: false,
      reason: "Your sign-in could not be completed",
      refusal: "incomplete",
    }
  }

  const [target] = await db
    .select({ status: organization.status })
    .from(organization)
    // A deleted organization does not exist for anyone signing in to it.
    .where(
      and(
        eq(organization.id, organizationId),
        ne(organization.status, "deleted")
      )
    )
    .limit(1)

  const [membership] = target
    ? await db
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, signedIn.userId)
          )
        )
        .limit(1)
    : []

  // Only an existence check: whether the invitation is actually usable is
  // decided by `resolvePendingInvitationFor` when they accept, and a stale yes
  // here costs nothing but a page that explains itself.
  const [invited] =
    target && !membership
      ? await db
          .select({ id: invitation.id })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, organizationId),
              eq(invitation.email, signedIn.email.toLowerCase()),
              gt(invitation.expiresAt, new Date())
            )
          )
          .limit(1)
      : []

  const decision = target
    ? decideSignIn(
        { isMember: Boolean(membership), isInvited: Boolean(invited) },
        target
      )
    : ({
        allowed: false,
        reason: "You are not a member of this organization",
        refusal: "notMember",
      } as const)

  if (!decision.allowed) {
    await db.delete(session).where(eq(session.token, sessionToken))
  }

  return decision
}
