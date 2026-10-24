"use server"

import { eq } from "drizzle-orm"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { getAccessContext } from "@/features/auth"
import {
  deliverAfterResponse,
  sendInvitationAcceptedNotice,
  type NoticeOrganization,
  type NoticeRecipient,
} from "@/features/notifications"
import { findInviterRecipients } from "@/features/organizations/lib/inviter-recipients"
import { isOpenToAnyone } from "@/features/organizations/lib/join-policy"
import { settleInvitationsFor } from "@/features/organizations/lib/settle-invitations"
import type { AcceptInvitationResult } from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import { member, organization } from "@/features/shared/lib/db/schema"
import { consumeRateLimit } from "@/features/shared/lib/rate-limit"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

const JOIN_LIMIT = { window: 60 * 60, max: 10 }

/**
 * The counterpart of public sign-up for someone who already has an account.
 * Sign-up creates an account and a membership together; this is the second half
 * on its own, so having an account is not what stops you joining.
 */
export async function joinOrganization(
  organizationSlug: string
): Promise<AcceptInvitationResult> {
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) {
    return { success: false, error: "Sign in first" }
  }

  const throttle = await consumeRateLimit(`join:${currentUser.id}`, JOIN_LIMIT)
  if (!throttle.allowed) {
    return { success: false, error: "Too many attempts. Try again later." }
  }

  const [target] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isRoot: organization.isRoot,
      status: organization.status,
      allowPublicSignUp: organization.allowPublicSignUp,
    })
    .from(organization)
    .where(eq(organization.slug, organizationSlug))
    .limit(1)

  // Read from the organization rather than trusted from the page that offered
  // the button, and refused identically whether it is closed or absent.
  if (!target || !isOpenToAnyone(target)) {
    return { success: false, error: "This organization is invitation only" }
  }

  // Joining settles an invitation just as accepting it would, so whoever sent
  // one is told, once this has committed.
  const accepted: {
    notice?: { organization: NoticeOrganization; inviters: NoticeRecipient[] }
  } = {}
  const joined = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        isRoot: organization.isRoot,
        status: organization.status,
        allowPublicSignUp: organization.allowPublicSignUp,
        logo: organization.logo,
        color: organization.color,
      })
      .from(organization)
      .where(eq(organization.id, target.id))
      .for("update")
      .limit(1)

    if (!current || !isOpenToAnyone(current)) return false

    const [created] = await tx
      .insert(member)
      .values({
        id: crypto.randomUUID(),
        organizationId: current.id,
        userId: currentUser.id,
        role: "member",
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: [member.organizationId, member.userId] })
      .returning({ id: member.id })

    const settled = await settleInvitationsFor(tx, current.id, [
      currentUser.email,
    ])

    if (created) {
      await recordAuditEvent(
        {
          action: "organization.member_added",
          actor: auditActorFromUser(currentUser),
          organization: {
            id: current.id,
            name: current.name,
            slug: current.slug,
          },
          target: { type: "user", id: currentUser.id, label: currentUser.name },
          metadata: { role: "member", via: "self-service" },
        },
        tx
      )
      accepted.notice = {
        organization: current,
        inviters: await findInviterRecipients(
          tx,
          current.id,
          settled.map((row) => row.inviterId),
          currentUser.id
        ),
      }
    }

    return true
  })

  if (!joined) {
    return { success: false, error: "This organization is invitation only" }
  }

  const { notice } = accepted
  if (notice) {
    for (const inviter of notice.inviters) {
      deliverAfterResponse(() =>
        sendInvitationAcceptedNotice({
          recipient: inviter,
          organization: notice.organization,
          invitee: currentUser,
          role: "member",
        })
      )
    }
  }

  revalidateEverywhere()

  return { success: true, slug: target.slug }
}
