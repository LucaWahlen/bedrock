"use client"

import { useFormatter, useTranslations } from "next-intl"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/features/shared/components/ui/chart"
import { ChartDataTable } from "@/features/usage/components/chart-data-table"
import { ChartEmpty } from "@/features/usage/components/chart-empty"
import { UsageChartTooltip } from "@/features/usage/components/usage-chart-tooltip"
import { axisDay, dayDate, FULL_DAY } from "@/features/usage/utils/chart"

export type BarSeries = {
  key: string
  label: string
  color: string
  // Drawn below the axis, as shadcn's negative bar chart does, for losses.
  below?: boolean
}

type Point = { day: string } & Record<string, number | null | string>

/**
 * Daily counts as bars, stacked when there are several. A series drawn below
 * the axis still reads as a positive count in the tooltip and the table.
 */
export function UsageDailyBars({
  points,
  series,
  period,
  caption,
  empty,
}: {
  points: Point[]
  series: BarSeries[]
  period: number
  caption: string
  empty: string
}) {
  const t = useTranslations("usage.chart")
  const format = useFormatter()
  const chartConfig = Object.fromEntries(
    series.map((bar) => [bar.key, { label: bar.label, color: bar.color }])
  ) satisfies ChartConfig
  const labels = Object.fromEntries(series.map((bar) => [bar.key, bar.label]))
  const data = points.map((point) => ({
    ...point,
    ...Object.fromEntries(
      series.map((bar) => {
        const value = point[bar.key]
        return [
          bar.key,
          typeof value === "number" && bar.below ? -value : value,
        ]
      })
    ),
  }))
  const quiet = points.every((point) => series.every((bar) => !point[bar.key]))

  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && !quiet && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-hidden="true"
        >
          {series.map((bar) => (
            <span key={bar.key} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-[2px]"
                style={{ backgroundColor: bar.color }}
              />
              {bar.label}
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
          <BarChart
            data={data}
            stackOffset="sign"
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
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(value: number) =>
                format.number(Math.abs(value), { notation: "compact" })
              }
            />
            <ChartTooltip
              cursor={false}
              content={<UsageChartTooltip labels={labels} indicator="dot" />}
            />
            {series.map((bar) => (
              <Bar
                key={bar.key}
                dataKey={bar.key}
                stackId="usage"
                fill={`var(--color-${bar.key})`}
                radius={bar.below ? [0, 0, 3, 3] : [3, 3, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      )}
      <ChartDataTable
        caption={caption}
        columns={[t("day"), ...series.map((bar) => bar.label)]}
        rows={points.map((point) => ({
          key: point.day,
          cells: [
            format.dateTime(dayDate(point.day), FULL_DAY),
            ...series.map((bar) => {
              const value = point[bar.key]
              return typeof value === "number"
                ? format.number(value)
                : t("notRolledUp")
            }),
          ],
        }))}
      />
    </div>
  )
}
