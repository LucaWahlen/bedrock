"use server"

import { and, eq, gte, inArray, isNull, lt, max, ne } from "drizzle-orm"
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
  USAGE_EVENT_METRICS,
  USAGE_PERIODS,
  type InstanceUsage,
  type InstanceUsageInput,
  type UsageComparison,
} from "@/features/usage/types"
import { addDays, periodBounds, utcDay } from "@/features/usage/utils/days"
import {
  liveTotals,
  summariseUsage,
} from "@/features/usage/utils/summarise-usage"

const inputSchema = z.object({ period: z.literal(USAGE_PERIODS) })

const TOP_ORGANIZATIONS = 5

/**
 * The whole instance's usage, and which organizations account for it. It
 * counts across every tenant, so it answers only to a root administrator.
 */
export async function getInstanceUsage(
  input: InstanceUsageInput
): Promise<InstanceUsage> {
  const { period } = inputSchema.parse(input)
  await requireRootAdministration("You cannot view the instance's usage")

  await rollUpMissingDays()
  const today = utcDay(new Date())
  const { currentFrom, previousFrom } = periodBounds(today, period)
  const instance = and(
    isNull(usageDaily.organizationId),
    isNull(usageDaily.subjectId)
  )

  const [rows, perOrganization, live, snapshot, [previousDay]] =
    await Promise.all([
      db
        .select({
          day: usageDaily.day,
          metric: usageDaily.metric,
          value: usageDaily.value,
        })
        .from(usageDaily)
        .where(
          and(
            instance,
            inArray(usageDaily.metric, [...USAGE_EVENT_METRICS]),
            gte(usageDaily.day, previousFrom),
            lt(usageDaily.day, today)
          )
        ),
      db
        .select({
          organizationId: usageDaily.organizationId,
          metric: usageDaily.metric,
          value: usageDaily.value,
        })
        .from(usageDaily)
        .where(
          and(
            isNull(usageDaily.subjectId),
            inArray(usageDaily.metric, ["active_users", "sign_ins"]),
            gte(usageDaily.day, currentFrom),
            lt(usageDaily.day, today)
          )
        ),
      computeEventMetrics(db, { from: today, to: addDays(today, 1) }),
      computeInstanceSnapshots(db),
      db
        .select({ day: max(usageDaily.day) })
        .from(usageDaily)
        .where(
          and(
            instance,
            eq(usageDaily.metric, "users"),
            lt(usageDaily.day, currentFrom)
          )
        ),
    ])

  const rolledUp = new Set(
    rows.filter((row) => row.metric === "sign_ins").map((row) => row.day)
  )
  const summary = summariseUsage({
    period,
    today,
    rows,
    rolledUp,
    live: liveTotals(live, null),
  })

  const previousSnapshot = previousDay?.day
    ? await db
        .select({ metric: usageDaily.metric, value: usageDaily.value })
        .from(usageDaily)
        .where(
          and(
            instance,
            eq(usageDaily.day, previousDay.day),
            inArray(usageDaily.metric, ["organizations", "users"])
          )
        )
    : null
  function compareSnapshot(metric: "organizations" | "users"): UsageComparison {
    return {
      current: snapshot.find((row) => row.metric === metric)?.value ?? 0,
      previous: previousSnapshot
        ? (previousSnapshot.find((row) => row.metric === metric)?.value ?? 0)
        : null,
    }
  }

  // Rolled-up days and today, per organization.
  const totals = new Map<string, { activeUsers: number; signIns: number }>()
  const liveTotalsOnly = live.filter((row) => row.subjectId === null)
  for (const row of [...perOrganization, ...liveTotalsOnly]) {
    if (!row.organizationId) continue
    const entry = totals.get(row.organizationId) ?? {
      activeUsers: 0,
      signIns: 0,
    }
    if (row.metric === "active_users") entry.activeUsers += row.value
    if (row.metric === "sign_ins") entry.signIns += row.value
    totals.set(row.organizationId, entry)
  }
  const days = summary.coverage.rolledUpDays + 1
  const ranked = [...totals]
    .filter(([, entry]) => entry.activeUsers > 0 || entry.signIns > 0)
    .toSorted(
      ([a, left], [b, right]) =>
        right.activeUsers - left.activeUsers ||
        right.signIns - left.signIns ||
        a.localeCompare(b)
    )
  // Root's members are the instance's administrators, not a tenant's users,
  // and a deleted organization no longer exists for anyone in it.
  const named =
    ranked.length > 0
      ? await db
          .select({
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          })
          .from(organization)
          .where(
            and(
              inArray(
                organization.id,
                ranked.map(([id]) => id)
              ),
              eq(organization.isRoot, false),
              ne(organization.status, "deleted")
            )
          )
      : []
  const byId = new Map(named.map((row) => [row.id, row]))

  return {
    period,
    ...summary,
    organizations: compareSnapshot("organizations"),
    users: compareSnapshot("users"),
    topOrganizations: ranked
      .flatMap(([id, entry]) => {
        const found = byId.get(id)
        return found
          ? [
              {
                ...found,
                activeUsers: Math.round((entry.activeUsers / days) * 100) / 100,
                signIns: entry.signIns,
              },
            ]
          : []
      })
      .slice(0, TOP_ORGANIZATIONS),
  }
}
