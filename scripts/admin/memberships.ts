import { and, asc, count, eq } from "drizzle-orm"

import { recordAuditEvent } from "@/features/audit"
import { hasRole, memberHasRole } from "@/features/auth/lib/member-role"
import type { OrganizationRole } from "@/features/auth/types"
import { db } from "@/features/shared/lib/db/client"
import { member, organization, user } from "@/features/shared/lib/db/schema"

const SYSTEM_ACTOR = { type: "system" } as const

export type AdminOrganization = {
  id: string
  name: string
  slug: string
  isRoot: boolean
}

export type AdminUser = { id: string; name: string; email: string }

export type MembershipResult = { ok: true } | { ok: false; error: string }

export function listOrganizations() {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isRoot: organization.isRoot,
    })
    .from(organization)
    .orderBy(asc(organization.name))
    .limit(200)
}

export function listMembers(organizationId: string) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(user.email))
}

async function findMembership(organizationId: string, userId: string) {
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
    .limit(1)

  return membership ?? null
}

async function countOwners(organizationId: string) {
  const [owners] = await db
    .select({ count: count() })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        memberHasRole(member.role, "owner")
      )
    )

  return owners.count
}

// An organization without an owner cannot be recovered through the interface,
// so the last one is not removable here either.
async function wouldStrandOrganization(
  organizationId: string,
  currentRole: string,
  nextRole?: OrganizationRole
) {
  if (!hasRole(currentRole, "owner") || nextRole === "owner") return false

  return (await countOwners(organizationId)) <= 1
}

export async function setMembershipRole(
  targetOrganization: AdminOrganization,
  targetUser: AdminUser,
  role: OrganizationRole
): Promise<MembershipResult> {
  const existing = await findMembership(targetOrganization.id, targetUser.id)

  if (
    existing &&
    (await wouldStrandOrganization(targetOrganization.id, existing.role, role))
  ) {
    return {
      ok: false,
      error: `${targetUser.email} is the last owner of ${targetOrganization.name}.`,
    }
  }

  await db
    .insert(member)
    .values({
      id: crypto.randomUUID(),
      organizationId: targetOrganization.id,
      userId: targetUser.id,
      role,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [member.organizationId, member.userId],
      set: { role },
    })

  await recordAuditEvent({
    action: existing
      ? "organization.member_role_changed"
      : "organization.member_added",
    actor: SYSTEM_ACTOR,
    organization: {
      id: targetOrganization.id,
      name: targetOrganization.name,
      slug: targetOrganization.slug,
    },
    target: { type: "user", id: targetUser.id, label: targetUser.email },
    metadata: existing ? { from: existing.role, to: role } : { role },
    reason: "Changed with the admin script",
  })

  return { ok: true }
}

export async function removeMember(
  targetOrganization: AdminOrganization,
  targetUser: AdminUser
): Promise<MembershipResult> {
  const existing = await findMembership(targetOrganization.id, targetUser.id)

  if (!existing) {
    return {
      ok: false,
      error: `${targetUser.email} is not a member of ${targetOrganization.name}.`,
    }
  }

  if (await wouldStrandOrganization(targetOrganization.id, existing.role)) {
    return {
      ok: false,
      error: `${targetUser.email} is the last owner of ${targetOrganization.name}.`,
    }
  }

  await db
    .delete(member)
    .where(
      and(
        eq(member.organizationId, targetOrganization.id),
        eq(member.userId, targetUser.id)
      )
    )

  await recordAuditEvent({
    action: "organization.member_removed",
    actor: SYSTEM_ACTOR,
    organization: {
      id: targetOrganization.id,
      name: targetOrganization.name,
      slug: targetOrganization.slug,
    },
    target: { type: "user", id: targetUser.id, label: targetUser.email },
    metadata: { role: existing.role },
    reason: "Removed with the admin script",
  })

  return { ok: true }
}
