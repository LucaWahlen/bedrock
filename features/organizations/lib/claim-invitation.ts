import { and, eq, gt, sql } from "drizzle-orm"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import {
  deliverAfterResponse,
  sendInvitationAcceptedNotice,
  type NoticeOrganization,
  type NoticeRecipient,
} from "@/features/notifications"
import { findInviterRecipients } from "@/features/organizations/lib/inviter-recipients"
import { isOrganizationRole } from "@/features/organizations/lib/member-role-display"
import type { ResolvedInvitation } from "@/features/organizations/lib/resolve-invitation"
import { db } from "@/features/shared/lib/db/client"
import {
  invitation,
  member,
  organization,
  user,
} from "@/features/shared/lib/db/schema"

/**
 * Turning an invitation into a membership, shared by all three ways in: an
 * already signed-in recipient, one who signs in to accept, and one who has no
 * account yet. Whoever flips the row out of `pending` first is the one who gets
 * the seat, so the same race is settled the same way whichever path ran.
 */
export async function claimInvitation({
  invited,
  claimant,
  via,
}: {
  invited: ResolvedInvitation
  claimant: { id: string; name: string; email: string }
  via: "session" | "sign-in" | "registration"
}) {
  // No organization authority: they are not a member until this succeeds, and
  // the invitation is what lets them in, not a membership they already hold.
  const actor = auditActorFromUser(claimant)
  // Filled in once the seat is taken, for the notice sent after commit.
  const accepted: {
    notice?: {
      organization: NoticeOrganization
      inviters: NoticeRecipient[]
      role: string
    }
  } = {}

  const claimed = await db.transaction(async (tx) => {
    // The page resolved an earlier snapshot. Lock and judge the current row so
    // expiry, suspension, and token rotation take effect before membership is
    // granted.
    const [current] = await tx
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        inviterId: invitation.inviterId,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        organizationLogo: organization.logo,
        organizationColor: organization.color,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(
        and(
          eq(invitation.id, invited.id),
          eq(invitation.tokenHash, invited.tokenHash),
          eq(invitation.organizationId, invited.organization.id),
          eq(sql`lower(${invitation.email})`, claimant.email.toLowerCase()),
          gt(invitation.expiresAt, new Date()),
          eq(organization.status, "active")
        )
      )
      .for("update")
      .limit(1)

    if (!current) return false

    const role =
      current.role && isOrganizationRole(current.role) ? current.role : "member"
    const [created] = await tx
      .insert(member)
      .values({
        id: crypto.randomUUID(),
        organizationId: current.organizationId,
        userId: claimant.id,
        role,
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: [member.organizationId, member.userId] })
      .returning({ id: member.id })

    await tx.delete(invitation).where(eq(invitation.id, current.id))

    // Reaching a mailed token is proof of the address, so a second round trip
    // through verification would ask for something already demonstrated.
    await tx
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, claimant.id))

    // Another path may have granted membership while this request was waiting
    // for the lock. Settle the invitation without claiming that its role won.
    if (!created) return true

    await recordAuditEvent(
      {
        action: "organization.invitation_accepted",
        actor,
        organization: {
          id: current.organizationId,
          name: current.organizationName,
          slug: current.organizationSlug,
        },
        target: { type: "user", id: claimant.id, label: claimant.name },
        metadata: { role, invitationId: current.id, via },
      },
      tx
    )

    accepted.notice = {
      organization: {
        name: current.organizationName,
        slug: current.organizationSlug,
        logo: current.organizationLogo,
        color: current.organizationColor,
      },
      inviters: await findInviterRecipients(
        tx,
        current.organizationId,
        [current.inviterId],
        claimant.id
      ),
      role,
    }

    return true
  })

  const { notice } = accepted
  if (notice) {
    for (const inviter of notice.inviters) {
      deliverAfterResponse(() =>
        sendInvitationAcceptedNotice({
          recipient: inviter,
          organization: notice.organization,
          invitee: claimant,
          role: notice.role,
        })
      )
    }
  }

  return claimed
}
