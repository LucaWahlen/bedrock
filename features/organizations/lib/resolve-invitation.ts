import { and, eq, gt, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { hashInvitationToken } from "@/features/organizations/lib/invitations"
import { isOrganizationRole } from "@/features/organizations/lib/member-role-display"
import type {
  InvitationRefusal,
  MemberRole,
  OrganizationStatus,
} from "@/features/organizations/types"
import { db } from "@/features/shared/lib/db/client"
import {
  invitation,
  member,
  organization,
  user,
} from "@/features/shared/lib/db/schema"

const inviter = alias(user, "inviter")

export type ResolvedInvitation = {
  id: string
  tokenHash: string
  email: string
  role: MemberRole
  expiresAt: Date
  inviterName: string | null
  organization: {
    id: string
    name: string
    slug: string
    logo: string | null
    color: string | null
    isRoot: boolean
    status: OrganizationStatus
  }
  recipientUserId: string | null
}

export type InvitationResolution =
  | { ok: true; invitation: ResolvedInvitation }
  | { ok: false; refusal: InvitationRefusal }

type Reader = Pick<typeof db, "select">

/**
 * The single judgement of an invitation, whichever way it was found. Both the
 * page that previews one and every action that accepts one come through here,
 * so none of them can decide an invitation is usable on terms another would
 * refuse.
 */
async function resolveInvitation(
  where: SQL,
  reader: Reader
): Promise<InvitationResolution> {
  const rows = await reader
    .select({
      id: invitation.id,
      tokenHash: invitation.tokenHash,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviterName: inviter.name,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      organizationLogo: organization.logo,
      organizationColor: organization.color,
      organizationIsRoot: organization.isRoot,
      organizationStatus: organization.status,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(inviter, eq(inviter.id, invitation.inviterId))
    .where(where)
    .limit(1)

  const row = rows[0]
  if (!row) return { ok: false, refusal: "unknown" }

  // Housekeeping removes lapsed invitations, but only on its own schedule, so
  // one can still be here and past its moment.
  if (row.expiresAt <= new Date()) return { ok: false, refusal: "expired" }
  if (row.organizationStatus !== "active") {
    return { ok: false, refusal: "organization_unavailable" }
  }

  const [recipient] = await reader
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, row.email))
    .limit(1)

  if (recipient) {
    const [existingMember] = await reader
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, row.organizationId),
          eq(member.userId, recipient.id)
        )
      )
      .limit(1)

    if (existingMember) return { ok: false, refusal: "already_member" }
  }

  return {
    ok: true,
    invitation: {
      id: row.id,
      tokenHash: row.tokenHash,
      email: row.email,
      role: row.role && isOrganizationRole(row.role) ? row.role : "member",
      expiresAt: row.expiresAt,
      inviterName: row.inviterName,
      organization: {
        id: row.organizationId,
        name: row.organizationName,
        slug: row.organizationSlug,
        logo: row.organizationLogo,
        color: row.organizationColor,
        isRoot: row.organizationIsRoot,
        status: row.organizationStatus,
      },
      recipientUserId: recipient?.id ?? null,
    },
  }
}

/** Found by the token from the mail, which is how a stranger arrives. */
export async function resolveInvitationByToken(
  token: string,
  reader: Reader = db
): Promise<InvitationResolution> {
  if (!token || token.length > 512) return { ok: false, refusal: "unknown" }

  return resolveInvitation(
    eq(invitation.tokenHash, hashInvitationToken(token)),
    reader
  )
}

function pendingFor(email: string, organizationId: string) {
  return and(
    eq(invitation.organizationId, organizationId),
    eq(invitation.email, email.toLowerCase()),
    gt(invitation.expiresAt, new Date())
  )!
}

/**
 * Whether this address has been offered a seat here. Deliberately not a Server
 * Action: taking an arbitrary address as a parameter over HTTP would be an
 * oracle for who has been invited where. Callers pass an address they already
 * established, such as the one on a session they just created.
 */
export async function hasPendingInvitationFor(
  email: string,
  organizationId: string,
  reader: Reader = db
) {
  const [row] = await reader
    .select({ id: invitation.id })
    .from(invitation)
    .where(pendingFor(email, organizationId))
    .limit(1)

  return row !== undefined
}

/**
 * Found by the address on a confirmed session, for someone who is already
 * signed in and never followed the link. Callers must have established that the
 * address is proven; this only finds what was offered to it.
 */
export async function resolvePendingInvitationFor(
  email: string,
  organizationId: string,
  reader: Reader = db
): Promise<InvitationResolution> {
  return resolveInvitation(pendingFor(email, organizationId), reader)
}
