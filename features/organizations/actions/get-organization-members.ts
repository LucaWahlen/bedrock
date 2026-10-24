"use server"

import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm"
import { alias, unionAll } from "drizzle-orm/pg-core"

import type { HeldApplicationRole } from "@/features/applications"
import {
  canAccessOrganization,
  getAccessContext,
  hasRole,
  isRootAdministrator,
  membershipIn,
  ORGANIZATION_ADMIN_ROLES,
  memberHasRole,
  splitRoles,
} from "@/features/auth"
import type { GroupSummary } from "@/features/groups"
import { MEMBERS_PAGE_SIZE } from "@/features/organizations/lib/people-search-params"
import {
  MEMBER_ROLES,
  MEMBER_STATUSES,
  PEOPLE_SORTS,
  type MemberCapabilities,
  type MemberRole,
  type MemberStatus,
  type OrganizationMember,
  type OrganizationMembersQuery,
  type OrganizationMembersResult,
} from "@/features/organizations/types"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { db } from "@/features/shared/lib/db/client"
import {
  applicationRole,
  group,
  groupMember,
  invitation,
  member,
  passkey,
  user,
} from "@/features/shared/lib/db/schema"
import {
  clampPage,
  normalizeIds,
  normalizeLiteral,
  normalizeLiterals,
  normalizePageSize,
  normalizeSearch,
} from "@/features/shared/lib/query"
import { roleGrantsIn } from "@/features/shared/lib/role-grants"

const recipient = alias(user, "recipient")

const inviter = alias(user, "inviter")

// Everyone the organization has a claim on: those who belong, and the addresses
// still waiting to answer. Unioned rather than listed apart, because "who is in
// this organization" is one question, and an invitation is only the part of the
// answer nobody has confirmed yet.
function peopleOf(organizationId: string) {
  const members = db
    .select({
      id: member.id,
      status:
        sql<string>`case when ${user.emailVerified} then 'confirmed' else 'unconfirmed' end`.as(
          "status"
        ),
      userId: sql<string | null>`${user.id}`.as("user_id"),
      name: sql<string | null>`${user.name}`.as("name"),
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      role: sql<string>`${member.role}`.as("role"),
      // A raw expression carries no decoder of its own, so it borrows the
      // column's; without this a timestamp arrives as the driver's string.
      addedAt: sql`${member.createdAt}`
        .mapWith(member.createdAt)
        .as("added_at"),
      lastActiveAt: user.lastActiveAt,
      inviterName: sql<string | null>`null`.as("inviter_name"),
      lastSentAt: sql`null`.mapWith(invitation.lastSentAt).as("last_sent_at"),
      expiresAt: sql`null`.mapWith(invitation.expiresAt).as("expires_at"),
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))

  const invitations = db
    .select({
      id: invitation.id,
      status: sql<string>`'invited'`.as("status"),
      userId: sql<string | null>`${recipient.id}`.as("user_id"),
      name: sql<string | null>`${recipient.name}`.as("name"),
      email: invitation.email,
      emailVerified:
        sql<boolean>`coalesce(${recipient.emailVerified}, false)`.as(
          "email_verified"
        ),
      image: recipient.image,
      role: sql<string>`coalesce(${invitation.role}, 'member')`.as("role"),
      addedAt: sql`${invitation.createdAt}`
        .mapWith(invitation.createdAt)
        .as("added_at"),
      lastActiveAt: recipient.lastActiveAt,
      inviterName: sql<string | null>`${inviter.name}`.as("inviter_name"),
      lastSentAt: sql`${invitation.lastSentAt}`
        .mapWith(invitation.lastSentAt)
        .as("last_sent_at"),
      expiresAt: sql`${invitation.expiresAt}`
        .mapWith(invitation.expiresAt)
        .as("expires_at"),
    })
    .from(invitation)
    .leftJoin(recipient, eq(sql`lower(${recipient.email})`, invitation.email))
    .leftJoin(inviter, eq(inviter.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        // Housekeeping clears lapsed rows on its own schedule, and someone can
        // be let in by another route while an invitation to them is open. Both
        // would otherwise show as pending against the evidence.
        sql`${invitation.expiresAt} > now()`,
        sql`not exists (
          select 1 from ${member}
          join ${user} on ${user.id} = ${member.userId}
          where ${member.organizationId} = ${invitation.organizationId}
            and lower(${user.email}) = ${invitation.email}
        )`
      )
    )

  return unionAll(members, invitations).as("people")
}

// An organization's own members, readable by anyone who belongs to it.
// Managing them is a narrower right, returned as capabilities so the table
// renders controls from what the server allows.
export async function getOrganizationMembers(
  query: OrganizationMembersQuery
): Promise<OrganizationMembersResult> {
  const access = await getAccessContext()
  const currentUser = access.user
  if (!currentUser) throw new UnauthorizedError()

  // A membership proves the organization exists, so nothing else has to be
  // read to know whether it may be seen.
  const membership = membershipIn(access, query.organizationId)

  if (!membership || !canAccessOrganization(membership)) {
    throw new ForbiddenError("You cannot view these members")
  }

  const isOwner = hasRole(membership.role, "owner")
  const administersFromInside = hasRole(
    membership.role,
    ...ORGANIZATION_ADMIN_ROLES
  )
  const capabilities: MemberCapabilities = {
    canManageMembers: administersFromInside,
    canManageOwners: isOwner,
    canSearchDirectory: isRootAdministrator(access),
    canManageApplicationRoles: administersFromInside && !membership.isRoot,
    canViewSecondFactors: administersFromInside,
  }

  const search = normalizeSearch(query.search)
  const roles = normalizeLiterals(query.roles, MEMBER_ROLES)
  const statuses = normalizeLiterals(query.statuses, MEMBER_STATUSES)
  const applicationRoleIds = capabilities.canManageApplicationRoles
    ? normalizeIds(query.applicationRoleIds, 50)
    : []
  const groupIds = capabilities.canManageApplicationRoles
    ? normalizeIds(query.groupIds, 50)
    : []
  const sort = normalizeLiteral(query.sort, PEOPLE_SORTS, "name")
  const direction = query.direction === "desc" ? "desc" : "asc"
  const pageSize = normalizePageSize(query.pageSize, MEMBERS_PAGE_SIZE)

  const people = peopleOf(membership.organizationId)
  // Held directly or through a group, which is what a token carries, so the
  // filter, the counts and the badges all answer the same question.
  const grants = roleGrantsIn(membership.organizationId)
  const searchFilter = search
    ? or(ilike(people.name, `%${search}%`), ilike(people.email, `%${search}%`))
    : undefined
  const resultFilter = and(
    searchFilter,
    roles.length
      ? or(...roles.map((role) => memberHasRole(people.role, role)))
      : undefined,
    statuses.length ? inArray(people.status, statuses) : undefined,
    // An invitation's id is never a membership's, so invitations drop out of
    // both. Every id is matched inside this organization, so another one's
    // role or group simply matches nobody.
    applicationRoleIds.length
      ? exists(
          db
            .select({ one: sql`1` })
            .from(grants)
            .where(
              and(
                eq(grants.memberId, people.id),
                inArray(grants.roleId, applicationRoleIds)
              )
            )
        )
      : undefined,
    groupIds.length
      ? exists(
          db
            .select({ one: sql`1` })
            .from(groupMember)
            .where(
              and(
                eq(groupMember.memberId, people.id),
                eq(groupMember.organizationId, membership.organizationId),
                inArray(groupMember.groupId, groupIds)
              )
            )
        )
      : undefined
  )

  const roleCount = (role: MemberRole) =>
    sql<number>`count(*) filter (where ${memberHasRole(people.role, role)})`.mapWith(
      Number
    )

  const statusCount = (status: MemberStatus) =>
    sql<number>`count(*) filter (where ${people.status} = ${status})`.mapWith(
      Number
    )

  const [[facets], [totalResult], roleFacets, groupFacets] = await Promise.all([
    // Counted over the search but not over either selection, so choosing one
    // option does not empty the others.
    db
      .select({
        owner: roleCount("owner"),
        admin: roleCount("admin"),
        member: roleCount("member"),
        confirmed: statusCount("confirmed"),
        unconfirmed: statusCount("unconfirmed"),
        invited: statusCount("invited"),
      })
      .from(people)
      .where(searchFilter),
    db.select({ count: count() }).from(people).where(resultFilter),
    capabilities.canManageApplicationRoles
      ? db
          .select({
            id: grants.roleId,
            count: countDistinct(grants.memberId),
          })
          .from(people)
          .innerJoin(grants, eq(grants.memberId, people.id))
          .where(searchFilter)
          .groupBy(grants.roleId)
      : [],
    capabilities.canManageApplicationRoles
      ? db
          .select({ id: groupMember.groupId, count: count() })
          .from(people)
          .innerJoin(
            groupMember,
            and(
              eq(groupMember.memberId, people.id),
              eq(groupMember.organizationId, membership.organizationId)
            )
          )
          .where(searchFilter)
          .groupBy(groupMember.groupId)
      : [],
  ])

  const total = totalResult.count
  const page = clampPage(query.page ?? 1, total, pageSize)
  const sortDirection = direction === "desc" ? desc : asc
  const orderBy =
    sort === "lastActiveAt"
      ? sql`${people.lastActiveAt} ${sql.raw(direction)} nulls last`
      : sort === "createdAt"
        ? sortDirection(people.addedAt)
        : // An invited address has no name until it has an account.
          sortDirection(sql`coalesce(${people.name}, ${people.email})`)

  const rows = await db
    .select()
    .from(people)
    .where(resultFilter)
    .orderBy(orderBy, asc(people.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const memberIds = rows.flatMap((row) => (row.expiresAt ? [] : [row.id]))
  // One row per way each member on the page holds each role.
  const assignments =
    capabilities.canManageApplicationRoles && memberIds.length > 0
      ? await db
          .select({
            memberId: grants.memberId,
            id: applicationRole.id,
            key: applicationRole.key,
            name: applicationRole.name,
            groupId: group.id,
            groupKey: group.key,
            groupName: group.name,
          })
          .from(grants)
          .innerJoin(applicationRole, eq(applicationRole.id, grants.roleId))
          .leftJoin(group, eq(group.id, grants.groupId))
          .where(
            and(
              inArray(grants.memberId, memberIds),
              eq(applicationRole.organizationId, membership.organizationId)
            )
          )
          .orderBy(
            asc(applicationRole.name),
            asc(applicationRole.id),
            asc(group.name)
          )
      : []
  const groupAssignments =
    capabilities.canManageApplicationRoles && memberIds.length > 0
      ? await db
          .select({
            memberId: groupMember.memberId,
            id: group.id,
            key: group.key,
            name: group.name,
          })
          .from(groupMember)
          .innerJoin(group, eq(group.id, groupMember.groupId))
          .where(
            and(
              inArray(groupMember.memberId, memberIds),
              eq(group.organizationId, membership.organizationId)
            )
          )
          .orderBy(asc(group.name))
      : []
  // Read through this organization's own memberships, so a user id from
  // anywhere else cannot be looked up through it.
  const secondFactors =
    capabilities.canViewSecondFactors && memberIds.length > 0
      ? await db
          .select({
            memberId: member.id,
            totp: user.twoFactorEnabled,
            passkeys:
              sql<number>`(select count(*) from ${passkey} where ${passkey.userId} = ${user.id})`.mapWith(
                Number
              ),
          })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(
            and(
              eq(member.organizationId, membership.organizationId),
              inArray(member.id, memberIds)
            )
          )
      : []
  const secondFactorByMember = new Map(
    secondFactors.map(({ memberId, ...status }) => [memberId, status])
  )

  const rolesByMember = new Map<string, Map<string, HeldApplicationRole>>()
  for (const {
    memberId,
    groupId,
    groupKey,
    groupName,
    ...role
  } of assignments) {
    const held = rolesByMember.get(memberId) ?? new Map()
    const entry: HeldApplicationRole = held.get(role.id) ?? {
      ...role,
      direct: false,
      groups: [],
    }
    if (groupId && groupKey && groupName) {
      entry.groups.push({ id: groupId, key: groupKey, name: groupName })
    } else {
      entry.direct = true
    }
    held.set(role.id, entry)
    rolesByMember.set(memberId, held)
  }

  const groupsByMember = new Map<string, GroupSummary[]>()
  for (const { memberId, ...held } of groupAssignments) {
    groupsByMember.set(memberId, [
      ...(groupsByMember.get(memberId) ?? []),
      held,
    ])
  }

  return {
    members: rows.map((row): OrganizationMember => {
      const person = {
        id: row.id,
        email: row.email,
        emailVerified: row.emailVerified,
        image: row.image,
        roles: splitRoles(row.role),
        addedAt: row.addedAt.toISOString(),
        lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
        isSelf: row.userId === currentUser.id,
      }

      if (row.expiresAt && row.lastSentAt) {
        return {
          ...person,
          userId: row.userId,
          name: row.name,
          pending: {
            lastSentAt: row.lastSentAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            inviterName: row.inviterName,
          },
        }
      }

      // Widened so the two halves of the union line up; the inner join is what
      // proves a membership always has a user behind it.
      return {
        ...person,
        userId: row.userId as string,
        name: row.name as string,
        pending: null,
        applicationRoles: [...(rolesByMember.get(row.id)?.values() ?? [])],
        groups: groupsByMember.get(row.id) ?? [],
        secondFactor: secondFactorByMember.get(row.id) ?? null,
      }
    }),
    total,
    page,
    pageSize,
    roleCounts: {
      owner: facets?.owner ?? 0,
      admin: facets?.admin ?? 0,
      member: facets?.member ?? 0,
    },
    statusCounts: {
      confirmed: facets?.confirmed ?? 0,
      unconfirmed: facets?.unconfirmed ?? 0,
      invited: facets?.invited ?? 0,
    },
    applicationRoleCounts: Object.fromEntries(
      roleFacets.map((facet) => [facet.id, facet.count])
    ),
    groupCounts: Object.fromEntries(
      groupFacets.map((facet) => [facet.id, facet.count])
    ),
    capabilities,
  }
}
