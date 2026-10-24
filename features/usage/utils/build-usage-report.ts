import {
  SIGN_IN_FAILURE_REASONS,
  SIGN_IN_METHODS,
  type ActivityPoint,
  type ApplicationUsage,
  type Breakdown,
  type CountPoint,
  type EngagementPoint,
  type GrowthPoint,
  type RatePoint,
  type SignInHeatmap,
  type UsageComparison,
  type UsageCoverage,
  type UsagePeriod,
  type UsageRate,
  type UsageReportBase,
} from "@/features/usage/types"
import { addDays, daysBetween, periodBounds } from "@/features/usage/utils/days"

// Turns one scope's stored counters, and today's live ones, into the figures a
// Usage page shows. Pure, so the same rows always give the same report.

export type ScopedRow = {
  day: string
  metric: string
  subjectId: string | null
  value: number
}

type Known = (day: string) => boolean

const key = (day: string, metric: string, subject: string | null) =>
  `${day}|${metric}|${subject ?? ""}`

const round = (value: number, digits = 2) =>
  Math.round(value * 10 ** digits) / 10 ** digits

export function usageIndex({
  period,
  today,
  rows,
  live,
  rolledUp,
  detailed,
}: {
  period: UsagePeriod
  today: string
  // Rolled-up days of the period and the one before it, today excluded.
  rows: ScopedRow[]
  // Today's counters and the current snapshot, without a day of their own.
  live: Omit<ScopedRow, "day">[]
  // Days rolled up at all, and days rolled up with the detail metrics.
  rolledUp: ReadonlySet<string>
  detailed: ReadonlySet<string>
}) {
  const { currentFrom, previousFrom, previousTo } = periodBounds(today, period)
  const values = new Map<string, number>()
  // Subjects seen per metric, so a breakdown lists only what occurred.
  const subjects = new Map<string, Set<string>>()

  const todays = live.map((counter) => ({ ...counter, day: today }))
  for (const row of [...rows, ...todays]) {
    const at = key(row.day, row.metric, row.subjectId)
    values.set(at, (values.get(at) ?? 0) + row.value)
    if (row.subjectId !== null) {
      const seen = subjects.get(row.metric) ?? new Set()
      seen.add(row.subjectId)
      subjects.set(row.metric, seen)
    }
  }

  const base: Known = (day) => day === today || rolledUp.has(day)
  const detail: Known = (day) => day === today || detailed.has(day)
  const current = daysBetween(currentFrom, today)
  const previous = daysBetween(previousFrom, previousTo)

  const get = (day: string, metric: string, subject: string | null = null) =>
    values.get(key(day, metric, subject)) ?? 0
  const has = (day: string, metric: string, subject: string | null = null) =>
    values.has(key(day, metric, subject))

  function sum(
    days: string[],
    known: Known,
    metric: string,
    subject: string | null = null
  ) {
    const counted = days.filter(known)
    return {
      days: counted.length,
      total: counted.reduce(
        (total, day) => total + get(day, metric, subject),
        0
      ),
    }
  }

  // A total over the period against the one before, when that was recorded.
  function compareSum(
    metric: string,
    known: Known = base,
    subject: string | null = null
  ): UsageComparison {
    const before = sum(previous, known, metric, subject)
    return {
      current: sum(current, known, metric, subject).total,
      previous: before.days > 0 ? before.total : null,
    }
  }

  // A daily average, for figures such as distinct people that do not add up.
  function compareAverage(metric: string, known: Known = base) {
    const average = (days: string[]) => {
      const span = sum(days, known, metric)
      return span.days > 0 ? round(span.total / span.days) : null
    }
    return { current: average(current) ?? 0, previous: average(previous) }
  }

  function series<T>(known: Known, point: (day: string) => T) {
    return current.map((day) => (known(day) ? point(day) : null))
  }

  function breakdown<K extends string>(
    metric: string,
    order: readonly K[] = []
  ): Breakdown<K> {
    const seen = [...(subjects.get(metric) ?? [])] as K[]
    const keys = [
      ...order,
      ...seen.filter((subject) => !order.includes(subject)).toSorted(),
    ]
    return keys
      .map((subject) => ({
        key: subject,
        value: sum(current, detail, metric, subject).total,
      }))
      .filter((entry) => entry.value > 0)
  }

  // A share of two snapshot counters: now, and at the end of the last day
  // before the period that has one.
  function snapshotRate(part: string, whole: string): UsageRate {
    const rate = (day: string) =>
      get(day, whole) > 0 ? get(day, part) / get(day, whole) : null
    const before = previous.findLast((day) => has(day, whole))
    return {
      current: rate(today),
      previous: before ? rate(before) : null,
    }
  }

  function snapshotCompare(metric: string): UsageComparison {
    const before = previous.findLast((day) => has(day, metric))
    return {
      current: get(today, metric),
      previous: before ? get(before, metric) : null,
    }
  }

  function snapshotTrend(part: string, whole: string): RatePoint[] {
    return current.map((day) => ({
      day,
      rate: get(day, whole) > 0 ? get(day, part) / get(day, whole) : null,
    }))
  }

  // Successful sign-ins over all attempts, across the days recorded.
  function successRate(): UsageRate {
    const rate = (days: string[]) => {
      const succeeded = sum(days, base, "sign_ins").total
      const attempts = succeeded + sum(days, base, "sign_in_failures").total
      return attempts > 0 ? succeeded / attempts : null
    }
    return { current: rate(current), previous: rate(previous) }
  }

  // How many of the month's people come on an average day.
  function stickiness(): UsageRate {
    const rate = (days: string[]) => {
      const ratios = days
        .filter((day) => detail(day) && get(day, "monthly_active_users") > 0)
        .map(
          (day) => get(day, "active_users") / get(day, "monthly_active_users")
        )
      return ratios.length > 0
        ? ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length
        : null
    }
    return { current: rate(current), previous: rate(previous) }
  }

  function heatmap(): SignInHeatmap {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
    for (const day of current.filter(detail)) {
      // Monday first, as ISO 8601 counts the week.
      const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
      for (let hour = 0; hour < 24; hour++) {
        grid[weekday]![hour]! += get(day, "sign_ins_by_hour", String(hour))
      }
    }
    return grid
  }

  function coverage(): UsageCoverage {
    const past = daysBetween(currentFrom, addDays(today, -1))
    return {
      rolledUpDays: past.filter((day) => rolledUp.has(day) && detailed.has(day))
        .length,
      pastDays: period - 1,
    }
  }

  function report(snapshot: { part: string; whole: string }): UsageReportBase {
    return {
      period,
      today,
      coverage: coverage(),
      signIns: compareSum("sign_ins"),
      activeUsers: compareAverage("active_users"),
      weeklyActiveUsers: {
        current: get(today, "weekly_active_users"),
        previous: detail(previousTo)
          ? get(previousTo, "weekly_active_users")
          : null,
      },
      stickiness: stickiness(),
      successRate: successRate(),
      secondFactorRate: snapshotRate(snapshot.part, snapshot.whole),
      secondFactor: {
        holders: get(today, snapshot.part),
        total: get(today, snapshot.whole),
      },
      activity: current.map(
        (day): ActivityPoint =>
          base(day)
            ? {
                day,
                signIns: get(day, "sign_ins"),
                activeUsers: get(day, "active_users"),
                failures: get(day, "sign_in_failures"),
              }
            : { day, signIns: null, activeUsers: null, failures: null }
      ),
      engagement: current.map(
        (day): EngagementPoint => ({
          day,
          daily: base(day) ? get(day, "active_users") : null,
          weekly: detail(day) ? get(day, "weekly_active_users") : null,
          monthly: detail(day) ? get(day, "monthly_active_users") : null,
        })
      ),
      authentication: {
        methods: breakdown("sign_in_methods", SIGN_IN_METHODS),
        failureReasons: breakdown(
          "sign_in_failure_reasons",
          SIGN_IN_FAILURE_REASONS
        ).toSorted((a, b) => b.value - a.value),
        secondFactorTrend: snapshotTrend(snapshot.part, snapshot.whole),
      },
      heatmap: heatmap(),
    }
  }

  function growth(): GrowthPoint[] {
    return current.map((day) =>
      detail(day)
        ? {
            day,
            joined: get(day, "members_joined"),
            removed: get(day, "members_removed"),
          }
        : { day, joined: null, removed: null }
    )
  }

  function counts(metric: string): CountPoint[] {
    return current.map((day) => ({
      day,
      value: detail(day) ? get(day, metric) : null,
    }))
  }

  // Each application's tokens and people, ranked by tokens in the period.
  function applications(limit: number): Omit<ApplicationUsage, "name">[] {
    const detailDays = current.filter(detail).length
    return [...(subjects.get("tokens_issued") ?? [])]
      .map((clientId) => ({
        clientId,
        tokens: compareSum("tokens_issued", base, clientId),
        activeUsers: round(
          sum(current, detail, "application_active_users", clientId).total /
            Math.max(detailDays, 1)
        ),
        trend: current.map((day) => get(day, "tokens_issued", clientId)),
      }))
      .filter((application) => application.tokens.current > 0)
      .toSorted(
        (a, b) =>
          b.tokens.current - a.tokens.current ||
          a.clientId.localeCompare(b.clientId)
      )
      .slice(0, limit)
  }

  return {
    current,
    get,
    sum,
    compareSum,
    compareAverage,
    snapshotCompare,
    breakdown,
    series,
    report,
    growth,
    counts,
    applications,
    base,
    detail,
  }
}

export type UsageIndex = ReturnType<typeof usageIndex>
