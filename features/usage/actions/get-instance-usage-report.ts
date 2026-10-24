"use server"

import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
} from "drizzle-orm"
import { z } from "zod"

import { requireRootAdministration } from "@/features/auth"
import { db } from "@/features/shared/lib/db/client"
import { organization, usageDaily } from "@/features/shared/lib/db/schema"
import {
  computeEventMetrics,
  computeInstanceSnapshots,
} from "@/features/usage/lib/compute-usage"
import { rollUpMissingDays } from "@/features/usage/lib/rollup"
import {
  USAGE_DETAIL_METRICS,
  USAGE_EVENT_METRICS,
  USAGE_PERIODS,
  USAGE_ROLLUP_MARKER,
  USAGE_ROLLUP_VERSION,
  type InstanceUsageInput,
  type InstanceUsageReport,
  type OrganizationRanking,
  type UsageRow,
} from "@/features/usage/types"
import {
  usageIndex,
  type ScopedRow,
} from "@/features/usage/utils/build-usage-report"
import { addDays, periodBounds, utcDay } from "@/features/usage/utils/days"

const inputSchema = z.object({ period: z.literal(USAGE_PERIODS) })

const TOP_ORGANIZATIONS = 10

const STORED_METRICS = [
  ...USAGE_EVENT_METRICS,
  ...USAGE_DETAIL_METRICS,
  "organizations",
  "users",
  "users_with_second_factor",
]

const RANKED_METRICS = ["sign_ins", "active_users", "tokens_issued"]

const ORGANIZATION_STATUSES = ["active", "suspended", "deleted"] as const

/**
 * The whole instance's usage in depth, and which organizations account for
 * it. It counts across every tenant, so it answers only to a root
 * administrator, and names nothing inside a tenant beyond the organization.
 */
export async function getInstanceUsageReport(
  input: InstanceUsageInput
): Promise<InstanceUsageReport> {
  const { period } = inputSchema.parse(input)
  await requireRootAdministration("You cannot view the instance's usage")

  await rollUpMissingDays()
  const today = utcDay(new Date())
  const { previousFrom } = periodBounds(today, period)
  const stored = and(
    gte(usageDaily.day, previousFrom),
    lt(usageDaily.day, today)
  )

  const [rows, markers, perOrganization, events, snapshot] = await Promise.all([
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
          isNull(usageDaily.organizationId),
          inArray(usageDaily.metric, STORED_METRICS),
          stored
        )
      ),
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
    db
      .select({
        organizationId: usageDaily.organizationId,
        day: usageDaily.day,
        metric: usageDaily.metric,
        subjectId: usageDaily.subjectId,
        value: usageDaily.value,
      })
      .from(usageDaily)
      .where(
        and(
          isNotNull(usageDaily.organizationId),
          isNull(usageDaily.subjectId),
          inArray(usageDaily.metric, RANKED_METRICS),
          stored
        )
      ),
    computeEventMetrics(db, { from: today, to: addDays(today, 1) }),
    computeInstanceSnapshots(db),
  ])

  const rolledUp = new Set(
    markers.filter((row) => row.metric === "sign_ins").map((row) => row.day)
  )
  const detailed = new Set(
    markers
      .filter(
        (row) =>
          row.metric === USAGE_ROLLUP_MARKER &&
          row.value >= USAGE_ROLLUP_VERSION
      )
      .map((row) => row.day)
  )
  const live = [...events, ...snapshot].filter(
    (row) => row.organizationId === null
  )
  const index = usageIndex({ period, today, rows, live, rolledUp, detailed })

  // Each organization measured the same way as the instance, then ranked.
  const storedByOrganization = new Map<string, ScopedRow[]>()
  for (const { organizationId, ...row } of perOrganization) {
    if (!organizationId) continue
    storedByOrganization.set(organizationId, [
      ...(storedByOrganization.get(organizationId) ?? []),
      row,
    ])
  }
  const liveByOrganization = new Map<string, UsageRow[]>()
  for (const row of events) {
    if (!row.organizationId || row.subjectId !== null) continue
    if (!RANKED_METRICS.includes(row.metric)) continue
    liveByOrganization.set(row.organizationId, [
      ...(liveByOrganization.get(row.organizationId) ?? []),
      row,
    ])
  }
  const measured = [
    ...new Set([...storedByOrganization.keys(), ...liveByOrganization.keys()]),
  ]
    .map((id) => {
      const organizationIndex = usageIndex({
        period,
        today,
        rows: storedByOrganization.get(id) ?? [],
        live: liveByOrganization.get(id) ?? [],
        rolledUp,
        detailed,
      })
      return {
        id,
        activeUsers: organizationIndex.compareAverage("active_users").current,
        signIns: organizationIndex.compareSum("sign_ins"),
        tokens: organizationIndex.compareSum("tokens_issued").current,
        trend: organizationIndex.current.map((day) =>
          organizationIndex.get(day, "sign_ins")
        ),
      }
    })
    .filter(
      (entry) =>
        entry.activeUsers > 0 || entry.signIns.current > 0 || entry.tokens > 0
    )
    .toSorted(
      (a, b) =>
        b.activeUsers - a.activeUsers ||
        b.signIns.current - a.signIns.current ||
        a.id.localeCompare(b.id)
    )

  // Root's members are the instance's administrators, not a tenant's users,
  // and a deleted organization no longer exists for anyone in it.
  const named =
    measured.length > 0
      ? await db
          .select({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            status: organization.status,
          })
          .from(organization)
          .where(
            and(
              inArray(
                organization.id,
                measured.map((entry) => entry.id)
              ),
              eq(organization.isRoot, false),
              ne(organization.status, "deleted")
            )
          )
      : []
  const byId = new Map(named.map((row) => [row.id, row]))
  const topOrganizations = measured
    .flatMap((entry): OrganizationRanking[] => {
      const found = byId.get(entry.id)
      return found && found.status !== "deleted"
        ? [{ ...entry, ...found, status: found.status }]
        : []
    })
    .slice(0, TOP_ORGANIZATIONS)

  return {
    ...index.report({ part: "users_with_second_factor", whole: "users" }),
    organizations: index.snapshotCompare("organizations"),
    users: index.snapshotCompare("users"),
    newUsers: index.compareSum("users_created", index.detail),
    newOrganizations: index.compareSum("organizations_created", index.detail)
      .current,
    userGrowth: index.counts("users_created"),
    organizationStatus: ORGANIZATION_STATUSES.map((status) => ({
      key: status,
      value: index.get(today, "organizations_by_status", status),
    })).filter((entry) => entry.value > 0),
    topOrganizations,
  }
}
