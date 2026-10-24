"use client"

import { useFormatter } from "next-intl"

import { dayDate, FULL_DAY } from "@/features/usage/utils/chart"

type TooltipEntry = {
  dataKey?: unknown
  value?: unknown
  color?: string
  payload?: { day?: unknown }
}

/**
 * The tooltip of a daily chart, styled as shadcn's chart tooltip, for values
 * the stock one cannot format: shares, and counts drawn below the axis.
 * Recharts passes `active` and `payload` when it clones the element.
 */
export function UsageChartTooltip({
  active,
  payload,
  labels,
  percent = false,
  indicator = "dot",
}: {
  active?: boolean
  payload?: readonly TooltipEntry[]
  labels: Record<string, string>
  percent?: boolean
  indicator?: "dot" | "line"
}) {
  const format = useFormatter()
  const entries = (payload ?? []).filter(
    (entry) => typeof entry.value === "number"
  )
  if (!active || entries.length === 0) return null

  const day = entries[0]?.payload?.day

  return (
    <div className="grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      {typeof day === "string" && (
        <div className="font-medium">
          {format.dateTime(dayDate(day), FULL_DAY)}
        </div>
      )}
      <div className="grid gap-1.5">
        {entries.map((entry) => {
          const value = Math.abs(entry.value as number)
          return (
            <div
              key={String(entry.dataKey)}
              className="flex items-center gap-2"
            >
              <span
                className={
                  indicator === "line"
                    ? "h-2.5 w-1 shrink-0 rounded-[2px]"
                    : "size-2.5 shrink-0 rounded-[2px]"
                }
                style={{ backgroundColor: entry.color }}
              />
              <span className="flex-1 text-muted-foreground">
                {labels[String(entry.dataKey)]}
              </span>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {percent
                  ? format.number(value, {
                      style: "percent",
                      maximumFractionDigits: 1,
                    })
                  : format.number(value, { maximumFractionDigits: 1 })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
