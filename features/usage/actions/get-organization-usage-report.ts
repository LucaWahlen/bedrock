"use server"

import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { z } from "zod"

import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { oauthClient, usageDaily } from "@/features/shared/lib/db/schema"
import { authorizeOrganizationUsage } from "@/features/usage/lib/authorize-organization-usage"
import {
  computeEventMetrics,
  computeOrganizationSnapshots,
} from "@/features/usage/lib/compute-usage"
import { rollUpMissingDays } from "@/features/usage/lib/rollup"
import {
  USAGE_DETAIL_METRICS,
  USAGE_EVENT_METRICS,
  USAGE_PERIODS,
  USAGE_ROLLUP_MARKER,
  USAGE_ROLLUP_VERSION,
  type InvitationFunnel,
  type OrganizationUsageInput,
  type OrganizationUsageReport,
} from "@/features/usage/types"
import { usageIndex } from "@/features/usage/utils/build-usage-report"
import { addDays, periodBounds, utcDay } from "@/features/usage/utils/days"

const inputSchema = z.object({
  organizationId: z.string().min(1),
  period: z.literal(USAGE_PERIODS),
})

const TOP_APPLICATIONS = 10

const STORED_METRICS = [
  ...USAGE_EVENT_METRICS,
  ...USAGE_DETAIL_METRICS,
  "members",
  "members_with_second_factor",
]

/**
 * Invitations first sent in the period, by what became of them: accepted,
 * still open, withdrawn, or lapsed without an answer. Read from the audit log,
 * so only as far back as it reaches.
 */
async function invitationFunnel(organizationId: string, from: string) {
  const [funnel] = await db.execute<InvitationFunnel>(sql`
    with sent as (
      select distinct target_id as id
      from audit_event
      where action = 'organization.member_invited'
        and outcome = 'success'
        and organization_id = ${organizationId}
        and target_type = 'invitation'
        and target_id is not null
        and created_at >= ${from}::date
    ),
    fate as (
      select
        exists (
          select 1 from audit_event accepted
          where accepted.action = 'organization.invitation_accepted'
            and accepted.outcome = 'success'
            and accepted.organization_id = ${organizationId}
            and accepted.metadata->>'invitationId' = sent.id
        ) as accepted,
        exists (
          select 1 from audit_event revoked
          where revoked.action = 'organization.invitation_revoked'
            and revoked.outcome = 'success'
            and revoked.organization_id = ${organizationId}
            and revoked.target_id = sent.id
        ) as revoked,
        exists (
          select 1 from invitation
          where invitation.id = sent.id
            and invitation.organization_id = ${organizationId}
            and invitation.expires_at > now()
        ) as open
      from sent
    )
    select count(*)::int as sent,
      count(*) filter (where accepted)::int as accepted,
      count(*) filter (where not accepted and open)::int as open,
      count(*) filter (where not accepted and not open and revoked)::int as revoked,
      count(*) filter (where not accepted and not open and not revoked)::int as expired
    from fate
  `)

  return {
    sent: Number(funnel?.sent ?? 0),
    accepted: Number(funnel?.accepted ?? 0),
    open: Number(funnel?.open ?? 0),
    revoked: Number(funnel?.revoked ?? 0),
    expired: Number(funnel?.expired ?? 0),
  }
}

/**
 * One tenant's usage in depth, for its own owners and admins: sign-ins and
 * how they were proven or refused, engagement, applications and membership.
 * Root administration grants nothing here. Every read is scoped by the
 * membership's organization id.
 */
export async function getOrganizationUsageReport(
  input: OrganizationUsageInput
): Promise<OrganizationUsageReport> {
  const { organizationId: requested, period } = inputSchema.parse(input)
  const organizationId = await authorizeOrganizationUsage(requested)

  await rollUpMissingDays()
  const today = utcDay(new Date())
  const { currentFrom, previousFrom } = periodBounds(today, period)
  const stored = and(
    gte(usageDaily.day, previousFrom),
    lt(usageDaily.day, today)
  )

  const [rows, markers, events, snapshot, invitations] = await Promise.all([
    db
      .select({
        day: usageDaily.day,
        metric: usageDaily.metric,
        subjectId: usageDaily.subjectId,
        value: usageDaily.value,
      })
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.organizationId, organizationId),
          inArray(usageDaily.metric, STORED_METRICS),
          stored
        )
      ),
    // Whether a day was rolled up is recorded for the whole instance, since a
    // tenant with nothing on a day has no row of its own to prove it.
    db
      .select({
        day: usageDaily.day,
        metric: usageDaily.metric,
        value: usageDaily.value,
      })
      .from(usageDaily)
      .where(
        and(
          isNull(usageDaily.organizationId),
          isNull(usageDaily.subjectId),
          or(
            eq(usageDaily.metric, "sign_ins"),
            eq(usageDaily.metric, USAGE_ROLLUP_MARKER)
          ),
          stored
        )
      ),
    computeEventMetrics(db, {
      from: today,
      to: addDays(today, 1),
      organizationId,
    }),
    computeOrganizationSnapshots(db, organizationId),
    invitationFunnel(organizationId, currentFrom),
  ])

  const live = [...events, ...snapshot].filter(
    (row) => row.organizationId === organizationId
  )
  const index = usageIndex({
    period,
    today,
    rows,
    live,
    rolledUp: new Set(
      markers.filter((row) => row.metric === "sign_ins").map((row) => row.day)
    ),
    detailed: new Set(
      markers
        .filter(
          (row) =>
            row.metric === USAGE_ROLLUP_MARKER &&
            row.value >= USAGE_ROLLUP_VERSION
        )
        .map((row) => row.day)
    ),
  })

  const ranked = index.applications(TOP_APPLICATIONS)
  // Names are read live and only from this organization's own clients.
  const names =
    ranked.length > 0
      ? await db
          .select({ clientId: oauthClient.clientId, name: oauthClient.name })
          .from(oauthClient)
          .where(
            and(
              eq(oauthClient.referenceId, organizationId),
              inArray(
                oauthClient.clientId,
                ranked.map((application) => application.clientId)
              )
            )
          )
      : []
  const nameOf = new Map(names.map((row) => [row.clientId, row.name]))

  return {
    ...index.report({ part: "members_with_second_factor", whole: "members" }),
    tokensIssued: index.compareSum("tokens_issued"),
    newMembers: index.compareSum("members_joined", index.detail),
    membersRemoved: index.compareSum("members_removed", index.detail).current,
    members: index.get(today, "members"),
    growth: index.growth(),
    roles: live
      .filter((row) => row.metric === "members_by_role" && row.subjectId)
      .map((row) => ({ key: row.subjectId as string, value: row.value }))
      .toSorted((a, b) => b.value - a.value || a.key.localeCompare(b.key)),
    invitations: {
      ...invitations,
      retentionDays: env.housekeeping.auditRetentionDays ?? null,
    },
    applications: ranked.map((application) => ({
      ...application,
      name: nameOf.get(application.clientId) ?? null,
    })),
  }
}
