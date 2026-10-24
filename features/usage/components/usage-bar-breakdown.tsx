import { useFormatter } from "next-intl"

import { ChartEmpty } from "@/features/usage/components/chart-empty"

export type BreakdownBar = { key: string; label: string; value: number }

/**
 * Counts by category, largest first, each with its share of the whole. The
 * bars share one scale; every figure is text, so the list needs no separate
 * accessible table.
 */
export function UsageBarBreakdown({
  bars,
  color = "var(--primary)",
  empty,
}: {
  bars: BreakdownBar[]
  color?: string
  empty: string
}) {
  const format = useFormatter()
  const total = bars.reduce((sum, bar) => sum + bar.value, 0)
  const largest = Math.max(...bars.map((bar) => bar.value), 1)

  if (total === 0) return <ChartEmpty>{empty}</ChartEmpty>

  return (
    <ul className="flex flex-col gap-3.5">
      {bars.map((bar) => (
        <li key={bar.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{bar.label}</span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              <span className="text-xs text-muted-foreground">
                {format.number(bar.value / total, {
                  style: "percent",
                  maximumFractionDigits: 0,
                })}
              </span>
              <span className="font-medium">{format.number(bar.value)}</span>
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((bar.value / largest) * 100, 2)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
