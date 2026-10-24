"use client"

import { useFormatter, useTranslations } from "next-intl"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/features/shared/components/ui/chart"
import { ChartDataTable } from "@/features/usage/components/chart-data-table"
import { ChartEmpty } from "@/features/usage/components/chart-empty"
import { UsageChartTooltip } from "@/features/usage/components/usage-chart-tooltip"
import { axisDay, dayDate, FULL_DAY } from "@/features/usage/utils/chart"

export type LineSeries = { key: string; label: string; color: string }

// Shares rarely reach the top, so the axis ends at the next tenth above the
// highest one rather than at 100%.
const shareCeiling = (highest: number) =>
  Math.min(1, Math.max(0.1, Math.ceil(highest * 10) / 10))

type Point = { day: string } & Record<string, number | null | string>

/**
 * Several daily series as lines, as shadcn's multiple line chart. Values are
 * counts, or shares between 0 and 1 drawn as percentages. A day nobody
 * recorded is a gap, bridged only for sparse snapshots.
 */
export function UsageLineChart({
  points,
  series,
  period,
  percent = false,
  sparse = false,
  caption,
  empty,
}: {
  points: Point[]
  series: LineSeries[]
  period: number
  percent?: boolean
  // Recorded on some days only: bridge the gaps and mark each recorded day.
  sparse?: boolean
  caption: string
  empty: string
}) {
  const t = useTranslations("usage.chart")
  const format = useFormatter()
  const chartConfig = Object.fromEntries(
    series.map((line) => [line.key, { label: line.label, color: line.color }])
  ) satisfies ChartConfig
  const labels = Object.fromEntries(
    series.map((line) => [line.key, line.label])
  )
  const formatValue = (value: number) =>
    percent
      ? format.number(value, { style: "percent", maximumFractionDigits: 1 })
      : format.number(value, { maximumFractionDigits: 1 })
  const recorded = points.filter((point) =>
    series.some((line) => typeof point[line.key] === "number")
  )
  const quiet = percent
    ? recorded.length === 0
    : points.every((point) => series.every((line) => !point[line.key]))

  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && !quiet && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          {series.map((line) => (
            <span key={line.key} className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: line.color }}
              />
              {line.label}
            </span>
          ))}
        </div>
      )}
      {quiet ? (
        <ChartEmpty>{empty}</ChartEmpty>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-60 w-full"
          aria-hidden="true"
        >
          <LineChart
            data={points}
            margin={{ left: 0, right: 8, top: 8 }}
            accessibilityLayer={false}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(day: string) =>
                format.dateTime(dayDate(day), axisDay(period))
              }
            />
            <YAxis
              width={percent ? 44 : 36}
              tickLine={false}
              axisLine={false}
              allowDecimals={percent}
              domain={percent ? [0, shareCeiling] : [0, "auto"]}
              tickFormatter={(value: number) =>
                percent
                  ? format.number(value, {
                      style: "percent",
                      maximumFractionDigits: 0,
                    })
                  : format.number(value, { notation: "compact" })
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <UsageChartTooltip
                  labels={labels}
                  indicator="line"
                  percent={percent}
                />
              }
            />
            {series.toReversed().map((line) => (
              <Line
                key={line.key}
                dataKey={line.key}
                type="monotone"
                stroke={`var(--color-${line.key})`}
                strokeWidth={2}
                dot={
                  sparse ? { r: 2.5, fill: `var(--color-${line.key})` } : false
                }
                connectNulls={sparse}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
      <ChartDataTable
        caption={caption}
        columns={[t("day"), ...series.map((line) => line.label)]}
        rows={points.map((point) => ({
          key: point.day,
          cells: [
            format.dateTime(dayDate(point.day), FULL_DAY),
            ...series.map((line) => {
              const value = point[line.key]
              return typeof value === "number"
                ? formatValue(value)
                : t(sparse ? "notRecorded" : "notRolledUp")
            }),
          ],
        }))}
      />
    </div>
  )
}
