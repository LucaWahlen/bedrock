import type {
  UsageComparison,
  UsageCoverage,
  UsageEventMetric,
  UsagePeriod,
  UsagePoint,
} from "@/features/usage/types"
import { addDays, daysBetween, periodBounds } from "@/features/usage/utils/days"

export type StoredUsage = { day: string; metric: string; value: number }

type Totals = Record<UsageEventMetric, number>

const emptyTotals = (): Totals => ({
  sign_ins: 0,
  sign_in_failures: 0,
  active_users: 0,
  tokens_issued: 0,
})

/**
 * Folds rolled-up days and today's live counts into a period's series and its
 * comparison with the period before. A day housekeeping has not rolled up is
 * unknown rather than zero: it is a gap in the series and left out of averages.
 *
 * `rolledUp` lists the days rolled up for the whole instance, which a tenant
 * with no activity on a day has no row of its own to prove.
 */
export function summariseUsage({
  period,
  today,
  rows,
  rolledUp,
  live,
}: {
  period: UsagePeriod
  today: string
  rows: StoredUsage[]
  rolledUp: ReadonlySet<string>
  live: Partial<Totals>
}) {
  const { currentFrom, previousFrom, previousTo } = periodBounds(today, period)
  const byDay = new Map<string, Totals>()
  for (const row of rows) {
    const totals = byDay.get(row.day) ?? emptyTotals()
    if (row.metric in totals)
      totals[row.metric as UsageEventMetric] += row.value
    byDay.set(row.day, totals)
  }
  byDay.set(today, { ...emptyTotals(), ...live })

  const known = (day: string) => day === today || rolledUp.has(day)

  function total(from: string, to: string) {
    const days = daysBetween(from, to).filter(known)
    const sums = emptyTotals()
    for (const day of days) {
      const totals = byDay.get(day)
      if (!totals) continue
      for (const metric of Object.keys(sums) as UsageEventMetric[]) {
        sums[metric] += totals[metric]
      }
    }

    return { days: days.length, sums }
  }

  const current = total(currentFrom, today)
  const previous = total(previousFrom, previousTo)

  function compare(metric: UsageEventMetric, average = false): UsageComparison {
    const value = (span: { days: number; sums: Totals }) =>
      average
        ? Math.round((span.sums[metric] / Math.max(span.days, 1)) * 100) / 100
        : span.sums[metric]

    return {
      current: value(current),
      previous: previous.days > 0 ? value(previous) : null,
    }
  }

  const series: UsagePoint[] = daysBetween(currentFrom, today).map((day) => {
    const totals = known(day) ? (byDay.get(day) ?? emptyTotals()) : null

    return {
      day,
      signIns: totals?.sign_ins ?? null,
      activeUsers: totals?.active_users ?? null,
    }
  })

  const coverage: UsageCoverage = {
    rolledUpDays: daysBetween(currentFrom, addDays(today, -1)).filter((day) =>
      rolledUp.has(day)
    ).length,
    pastDays: period - 1,
  }

  return {
    series,
    coverage,
    signIns: compare("sign_ins"),
    activeUsers: compare("active_users", true),
    tokensIssued: compare("tokens_issued"),
  }
}

// Live counts for one scope, by metric, out of computed rows.
export function liveTotals(
  rows: {
    organizationId: string | null
    metric: string
    subjectId: string | null
    value: number
  }[],
  organizationId: string | null
): Partial<Totals> {
  const totals: Partial<Totals> = {}
  for (const row of rows) {
    if (row.organizationId !== organizationId || row.subjectId !== null)
      continue
    if (row.metric in emptyTotals()) {
      totals[row.metric as UsageEventMetric] = row.value
    }
  }

  return totals
}
