import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  ne,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm"

import type { db } from "@/features/shared/lib/db/client"
import {
  auditEvent,
  invitation,
  member,
  oauthAccessToken,
  oauthClient,
  organization,
  passkey,
  user,
} from "@/features/shared/lib/db/schema"
import type { UsageMetric, UsageRow } from "@/features/usage/types"
import { addDays } from "@/features/usage/utils/days"

// The counting behind both the daily rollup and today's live figures, so a
// day reads the same before and after housekeeping has rolled it up.
//
// Deliberately not Server Actions: these carry no authorization of their own.
// The usage actions call them after checking the caller, and housekeeping
// calls them as the trusted process it is.

type Executor =
  | typeof db
  | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0]

type Window = {
  // ISO dates; `from` is included and `to` is not.
  from: string
  to: string
  // Narrows every count to one organization, for a tenant's live figures.
  organizationId?: string
}

const SIGN_IN = "authentication.login"
const JOINED = ["organization.member_added", "organization.invitation_accepted"]
const REMOVED = "organization.member_removed"
const USER_CREATED = "user.created"
const ORGANIZATION_CREATED = "organization.created"

function inWindow(column: SQL | AnyColumn, window: Window) {
  return sql`${column} >= ${window.from}::date and ${column} < ${window.to}::date`
}

type Grouped = { organization_id: string | null; total: number }

// The instance's total, or one organization's. Activity attributed to no
// organization has no row of its own beyond the instance total.
const ownerOf = (row: Grouped) =>
  row.total ? null : (row.organization_id ?? undefined)

// How a sign-in was proven, from what the sign-in actions record: a passkey
// names itself, a second factor names its kind, and a password alone neither.
const signInMethod = sql`case
  when ${auditEvent.metadata}->>'method' = 'passkey' then 'passkey'
  when ${auditEvent.metadata} ? 'secondFactor' then 'two_factor'
  else 'password'
end`

// Why a sign-in was refused, from its outcome and the English reason recorded
// with it. Anything unrecognised is counted rather than dropped.
const failureReason = sql`case
  when ${auditEvent.outcome} = 'denied' and ${auditEvent.reason} like 'Too many%' then 'rate_limited'
  when ${auditEvent.outcome} = 'denied' and ${auditEvent.reason} = 'Account is disabled' then 'disabled'
  when ${auditEvent.outcome} = 'denied' and ${auditEvent.reason} = 'You are not a member of this organization' then 'not_member'
  when ${auditEvent.outcome} = 'denied' and ${auditEvent.reason} = 'This organization is suspended' then 'suspended'
  when ${auditEvent.outcome} = 'failure' and ${auditEvent.metadata} ? 'secondFactor' then 'second_factor'
  when ${auditEvent.outcome} = 'failure' and ${auditEvent.metadata}->>'method' = 'passkey' then 'passkey'
  when ${auditEvent.outcome} = 'failure' then 'invalid_credentials'
  else 'other'
end`

/**
 * Distinct people who signed in or received a token within a window, per
 * organization and for the instance.
 */
function activeUsersIn(executor: Executor, window: Window) {
  const { organizationId } = window
  const signInScope = organizationId
    ? sql`and ${auditEvent.organizationId} = ${organizationId}`
    : sql``
  const tokenScope = organizationId
    ? sql`and ${oauthClient.referenceId} = ${organizationId}`
    : sql``

  return executor.execute<Grouped & { users: number }>(sql`
    with activity as (
      select ${auditEvent.organizationId} as organization_id,
        ${auditEvent.actorUserId} as user_id
      from ${auditEvent}
      where ${auditEvent.action} = ${SIGN_IN}
        and ${auditEvent.outcome} = 'success'
        and ${auditEvent.actorUserId} is not null
        and ${inWindow(auditEvent.createdAt, window)}
        ${signInScope}
      union
      select ${oauthClient.referenceId}, ${oauthAccessToken.userId}
      from ${oauthAccessToken}
      join ${oauthClient} on ${oauthClient.clientId} = ${oauthAccessToken.clientId}
      where ${oauthAccessToken.userId} is not null
        and ${inWindow(oauthAccessToken.createdAt, window)}
        ${tokenScope}
    )
    select organization_id, grouping(organization_id)::int as total,
      count(distinct user_id)::int as users
    from activity
    group by grouping sets ((organization_id), ())
  `)
}

/**
 * Everything counted from what happened within a window, per organization and
 * for the instance: sign-ins and how they were proven or refused, active
 * people over the day and the 7 and 30 days ending with it, tokens per
 * application, and membership changes. Instance totals of the headline
 * counters are always present, even at zero; anything else appears only where
 * something happened.
 *
 * A sign-in belongs to the organization it was made at; a token to the
 * organization owning the client. Activity attributed to no organization
 * counts towards the instance alone. The rolling windows reach back before
 * `from`, as far as the audit log still does.
 */
export async function computeEventMetrics(
  executor: Executor,
  window: Window
): Promise<UsageRow[]> {
  const { organizationId } = window
  const signInScope = organizationId
    ? sql`and ${auditEvent.organizationId} = ${organizationId}`
    : sql``
  const tokenScope = organizationId
    ? sql`and ${oauthClient.referenceId} = ${organizationId}`
    : sql``

  const [signIns, breakdown, tokens, daily, weekly, monthly, membership] =
    await Promise.all([
      executor.execute<Grouped & { sign_ins: number; failures: number }>(sql`
        select ${auditEvent.organizationId} as organization_id,
          grouping(${auditEvent.organizationId})::int as total,
          count(*) filter (where ${auditEvent.outcome} = 'success')::int as sign_ins,
          count(*) filter (where ${auditEvent.outcome} <> 'success')::int as failures
        from ${auditEvent}
        where ${auditEvent.action} = ${SIGN_IN}
          and ${inWindow(auditEvent.createdAt, window)}
          ${signInScope}
        group by grouping sets ((${auditEvent.organizationId}), ())
      `),
      executor.execute<
        Grouped & { metric: UsageMetric; subject: string; value: number }
      >(sql`
        select organization_id, grouping(organization_id)::int as total,
          metric, subject, count(*)::int as value
        from (
          select ${auditEvent.organizationId} as organization_id,
            case when ${auditEvent.outcome} = 'success'
              then 'sign_in_methods' else 'sign_in_failure_reasons' end as metric,
            case when ${auditEvent.outcome} = 'success'
              then ${signInMethod} else ${failureReason} end as subject
          from ${auditEvent}
          where ${auditEvent.action} = ${SIGN_IN}
            and ${inWindow(auditEvent.createdAt, window)}
            ${signInScope}
          union all
          select ${auditEvent.organizationId}, 'sign_ins_by_hour',
            extract(hour from ${auditEvent.createdAt})::int::text
          from ${auditEvent}
          where ${auditEvent.action} = ${SIGN_IN}
            and ${auditEvent.outcome} = 'success'
            and ${inWindow(auditEvent.createdAt, window)}
            ${signInScope}
        ) as sign_in
        group by grouping sets ((organization_id, metric, subject), (metric, subject))
      `),
      executor.execute<
        Grouped & { client_id: string | null; tokens: number; users: number }
      >(sql`
        select ${oauthClient.referenceId} as organization_id,
          ${oauthAccessToken.clientId} as client_id,
          grouping(${oauthClient.referenceId}, ${oauthAccessToken.clientId})::int as total,
          count(*)::int as tokens,
          count(distinct ${oauthAccessToken.userId})::int as users
        from ${oauthAccessToken}
        join ${oauthClient} on ${oauthClient.clientId} = ${oauthAccessToken.clientId}
        where ${inWindow(oauthAccessToken.createdAt, window)}
          ${tokenScope}
        group by grouping sets (
          (${oauthClient.referenceId}, ${oauthAccessToken.clientId}),
          (${oauthClient.referenceId}),
          ()
        )
      `),
      activeUsersIn(executor, window),
      activeUsersIn(executor, { ...window, from: addDays(window.to, -7) }),
      activeUsersIn(executor, { ...window, from: addDays(window.to, -30) }),
      executor.execute<
        Grouped & {
          joined: number
          removed: number
          users_created: number
          organizations_created: number
        }
      >(sql`
        select ${auditEvent.organizationId} as organization_id,
          grouping(${auditEvent.organizationId})::int as total,
          count(*) filter (where ${inArray(auditEvent.action, JOINED)})::int as joined,
          count(*) filter (where ${auditEvent.action} = ${REMOVED})::int as removed,
          count(*) filter (where ${auditEvent.action} = ${USER_CREATED})::int as users_created,
          count(*) filter (where ${auditEvent.action} = ${ORGANIZATION_CREATED})::int as organizations_created
        from ${auditEvent}
        where ${inArray(auditEvent.action, [...JOINED, REMOVED, USER_CREATED, ORGANIZATION_CREATED])}
          and ${auditEvent.outcome} = 'success'
          and ${inWindow(auditEvent.createdAt, window)}
          ${signInScope}
        group by grouping sets ((${auditEvent.organizationId}), ())
      `),
    ])

  const rows: UsageRow[] = []
  const push = (
    owner: string | null,
    metric: UsageMetric,
    value: number,
    subjectId: string | null = null
  ) =>
    rows.push({
      organizationId: owner,
      metric,
      subjectId,
      value: Number(value),
    })

  for (const row of signIns) {
    const owner = ownerOf(row)
    if (owner === undefined) continue
    push(owner, "sign_ins", row.sign_ins)
    push(owner, "sign_in_failures", row.failures)
  }

  for (const row of breakdown) {
    const owner = ownerOf(row)
    if (owner === undefined) continue
    push(owner, row.metric, row.value, row.subject)
  }

  // 0: one client of one organization; 1: an organization; 3: the instance.
  for (const row of tokens) {
    if (row.total === 3) {
      push(null, "tokens_issued", row.tokens)
    } else if (row.organization_id) {
      const client = row.total === 0 ? row.client_id : null
      push(row.organization_id, "tokens_issued", row.tokens, client)
      if (client) {
        push(row.organization_id, "application_active_users", row.users, client)
      }
    }
  }

  for (const [metric, result] of [
    ["active_users", daily],
    ["weekly_active_users", weekly],
    ["monthly_active_users", monthly],
  ] as const) {
    for (const row of result) {
      const owner = ownerOf(row)
      if (owner === undefined) continue
      push(owner, metric, row.users)
    }
  }

  for (const row of membership) {
    const owner = ownerOf(row)
    if (owner === undefined) continue
    push(owner, "members_joined", row.joined)
    push(owner, "members_removed", row.removed)
    if (owner === null) {
      push(null, "users_created", row.users_created)
      push(null, "organizations_created", row.organizations_created)
    }
  }

  return rows
}

// Someone who can prove a second factor: an authenticator app or a passkey.
const holdsSecondFactor = sql`(${user.twoFactorEnabled} or exists (select 1 from ${passkey} where ${passkey.userId} = ${user.id}))`

/**
 * Each organization's membership, roles, open invitations and applications as
 * they stand now. Deleted organizations are left out; disabled accounts are
 * not counted as members, since they can reach nothing.
 */
export async function computeOrganizationSnapshots(
  executor: Executor,
  organizationId?: string
): Promise<UsageRow[]> {
  const current = and(
    ne(organization.status, "deleted"),
    organizationId ? eq(organization.id, organizationId) : undefined
  )
  const [roles, invitations, applications] = await Promise.all([
    executor
      .select({
        organizationId: member.organizationId,
        role: member.role,
        members: count(),
        withSecondFactor:
          sql<number>`count(*) filter (where ${holdsSecondFactor})`.mapWith(
            Number
          ),
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(current, sql`${user.disabledAt} is null`))
      .groupBy(member.organizationId, member.role),
    executor
      .select({ organizationId: invitation.organizationId, open: count() })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(and(current, gt(invitation.expiresAt, sql`now()`)))
      .groupBy(invitation.organizationId),
    executor
      .select({
        organizationId: oauthClient.referenceId,
        applications: count(),
      })
      .from(oauthClient)
      .innerJoin(organization, eq(organization.id, oauthClient.referenceId))
      .where(and(current, isNotNull(oauthClient.referenceId)))
      .groupBy(oauthClient.referenceId),
  ])

  const totals = new Map<string, { members: number; secured: number }>()
  const rows: UsageRow[] = []
  for (const row of roles) {
    const entry = totals.get(row.organizationId) ?? { members: 0, secured: 0 }
    entry.members += row.members
    entry.secured += row.withSecondFactor
    totals.set(row.organizationId, entry)
    rows.push({
      organizationId: row.organizationId,
      metric: "members_by_role",
      subjectId: row.role,
      value: row.members,
    })
  }
  for (const [id, entry] of totals) {
    rows.push(
      {
        organizationId: id,
        metric: "members",
        subjectId: null,
        value: entry.members,
      },
      {
        organizationId: id,
        metric: "members_with_second_factor",
        subjectId: null,
        value: entry.secured,
      }
    )
  }
  for (const row of invitations) {
    rows.push({
      organizationId: row.organizationId,
      metric: "invitations_open",
      subjectId: null,
      value: row.open,
    })
  }
  for (const row of applications) {
    if (!row.organizationId) continue
    rows.push({
      organizationId: row.organizationId,
      metric: "applications",
      subjectId: null,
      value: row.applications,
    })
  }

  return rows
}

const instance = (
  metric: UsageMetric,
  value: number,
  subjectId: string | null = null
): UsageRow => ({ organizationId: null, metric, subjectId, value })

/**
 * The instance as the Overview counts it: active organizations, every user
 * account, and every registered application; with organizations by status and
 * how many accounts hold a second factor.
 */
export async function computeInstanceSnapshots(
  executor: Executor
): Promise<UsageRow[]> {
  const [statuses, [users], [applications]] = await Promise.all([
    executor
      .select({ status: organization.status, value: count() })
      .from(organization)
      .groupBy(organization.status),
    executor
      .select({
        value: count(),
        secured:
          sql<number>`count(*) filter (where ${holdsSecondFactor})`.mapWith(
            Number
          ),
      })
      .from(user),
    executor.select({ value: count() }).from(oauthClient),
  ])

  return [
    instance(
      "organizations",
      statuses.find((row) => row.status === "active")?.value ?? 0
    ),
    ...statuses.map((row) =>
      instance("organizations_by_status", row.value, row.status)
    ),
    instance("users", users?.value ?? 0),
    instance("users_with_second_factor", users?.secured ?? 0),
    instance("applications", applications?.value ?? 0),
  ]
}
