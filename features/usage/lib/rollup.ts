import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm"

import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { organization, usageDaily } from "@/features/shared/lib/db/schema"
import {
  computeEventMetrics,
  computeInstanceSnapshots,
  computeOrganizationSnapshots,
} from "@/features/usage/lib/compute-usage"
import {
  INSTANCE_SNAPSHOT_METRICS,
  ORGANIZATION_SNAPSHOT_METRICS,
  USAGE_DETAIL_METRICS,
  USAGE_EVENT_METRICS,
  USAGE_ROLLUP_MARKER,
  USAGE_ROLLUP_VERSION,
  type UsageMetric,
  type UsageRow,
} from "@/features/usage/types"
import { addDays, daysBetween, utcDay } from "@/features/usage/utils/days"

// Further back than this the chart has no use for, and the audit log may not
// reach anyway.
export const MAX_BACKFILL_DAYS = 90

const SNAPSHOT_METRICS: UsageMetric[] = [
  ...new Set([...ORGANIZATION_SNAPSHOT_METRICS, ...INSTANCE_SNAPSHOT_METRICS]),
]

const EVENT_METRICS: UsageMetric[] = [
  ...USAGE_EVENT_METRICS,
  ...USAGE_DETAIL_METRICS,
  USAGE_ROLLUP_MARKER,
]

const marker: UsageRow = {
  organizationId: null,
  metric: USAGE_ROLLUP_MARKER,
  subjectId: null,
  value: USAGE_ROLLUP_VERSION,
}

// A day is rolled up once its instance sign-in count exists, which every
// rollup writes even when it is zero, and fully so once its instance marker
// carries the current version.
const isInstanceTotal = (metric: UsageMetric) =>
  and(
    isNull(usageDaily.organizationId),
    isNull(usageDaily.subjectId),
    eq(usageDaily.metric, metric)
  )

/**
 * Replaces one day's counters as a whole. The advisory lock serialises two
 * runs on the same day, so the second sees the first's rows and replaces them
 * rather than colliding with them.
 */
async function rollUpDay(day: string, snapshots: boolean) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`usage_daily:${day}`}))`
    )

    const [events, organizations, tenants, instance] = await Promise.all([
      computeEventMetrics(tx, { from: day, to: addDays(day, 1) }),
      tx.select({ id: organization.id }).from(organization),
      snapshots ? computeOrganizationSnapshots(tx) : [],
      snapshots ? computeInstanceSnapshots(tx) : [],
    ])
    // A purged organization's activity stays in the instance total only.
    const existing = new Set(organizations.map((row) => row.id))
    const rows = [...events, ...tenants, ...instance, marker].filter(
      (row) =>
        row.organizationId === null ||
        (existing.has(row.organizationId) && row.value > 0)
    )
    const metrics = snapshots
      ? [...EVENT_METRICS, ...SNAPSHOT_METRICS]
      : EVENT_METRICS

    await tx
      .delete(usageDaily)
      .where(and(eq(usageDaily.day, day), inArray(usageDaily.metric, metrics)))
    if (rows.length > 0) {
      await tx.insert(usageDaily).values(rows.map((row) => ({ ...row, day })))
    }

    return rows.length
  })
}

/**
 * Rolls up yesterday, and any earlier day within reach that has no rollup yet
 * or one from an earlier version, which lacks the detail metrics.
 * Reach is the audit retention period, capped at 90 days: past it the events a
 * day would be counted from may already be gone, and a partial day is worse
 * than none.
 *
 * Snapshots describe the end of a day, so only yesterday gets one, and only
 * from the first run after it ended, which is the closest any run gets.
 */
export async function housekeepUsage({
  now = new Date(),
  retentionDays = env.housekeeping.auditRetentionDays,
  reachDays = MAX_BACKFILL_DAYS,
  recountYesterday = true,
}: {
  now?: Date
  retentionDays?: number
  // How far back to look for missing days, never past the audit retention.
  reachDays?: number
  // Housekeeping recounts yesterday on every run; a page read does not.
  recountYesterday?: boolean
} = {}) {
  const today = utcDay(now)
  const yesterday = addDays(today, -1)
  const reach = Math.min(
    retentionDays ?? MAX_BACKFILL_DAYS,
    reachDays,
    MAX_BACKFILL_DAYS
  )
  const earliest = addDays(today, -(reach - 1))

  const [recorded, [snapshot]] = await Promise.all([
    db
      .selectDistinct({ day: usageDaily.day })
      .from(usageDaily)
      .where(
        and(
          isInstanceTotal(USAGE_ROLLUP_MARKER),
          gte(usageDaily.value, USAGE_ROLLUP_VERSION),
          gte(usageDaily.day, earliest),
          lte(usageDaily.day, yesterday)
        )
      ),
    db
      .select({ day: usageDaily.day })
      .from(usageDaily)
      .where(and(isInstanceTotal("users"), eq(usageDaily.day, yesterday)))
      .limit(1),
  ])
  const done = new Set(recorded.map((row) => row.day))
  // Yesterday is always counted again: a run just after midnight may have
  // raced the day's last events.
  const days = daysBetween(earliest, yesterday).filter(
    (day) => (recountYesterday && day === yesterday) || !done.has(day)
  )

  let rows = 0
  for (const day of days) {
    rows += await rollUpDay(day, day === yesterday && !snapshot)
  }

  return { days: days.length, from: days[0] ?? null, to: yesterday, rows }
}

// A week is what a missed scheduler costs a reader at most; anything older is
// housekeeping's to catch up on, and the page says so.
const LAZY_REACH_DAYS = 7

/**
 * Called by the usage reads before they count, so the days since the last
 * housekeeping run are rolled up on first view rather than shown as missing.
 * Idempotent and serialised per day, so concurrent readers are safe; when
 * nothing is missing it costs one small query.
 */
export async function rollUpMissingDays(now = new Date()) {
  return housekeepUsage({
    now,
    reachDays: LAZY_REACH_DAYS,
    recountYesterday: false,
  })
}
