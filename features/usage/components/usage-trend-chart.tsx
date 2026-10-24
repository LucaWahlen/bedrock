"use client"

import {
  useFormatter,
  useTranslations,
  type DateTimeFormatOptions,
} from "next-intl"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/features/shared/components/ui/chart"
import type { UsagePoint } from "@/features/usage/types"

const SERIES = {
  signIns: "var(--primary)",
  activeUsers: "var(--chart-2)",
} as const

// Usage days are UTC dates, so they are labelled in UTC too.
const SHORT_DAY = { day: "2-digit", month: "2-digit", timeZone: "UTC" } as const
const FULL_DAY = { dateStyle: "medium", timeZone: "UTC" } as const

const dayDate = (day: string) => new Date(`${day}T00:00:00Z`)

/**
 * Daily sign-ins and active users. The chart is for the eye; a visually hidden
 * table carries the same figures for assistive technology.
 */
export function UsageTrendChart({
  points,
  caption,
  note,
  empty,
}: {
  points: UsagePoint[]
  caption: string
  // One muted line beside the legend, such as how much is rolled up.
  note?: string
  // Shown in the chart's place, at its height, when nothing happened.
  empty: string
}) {
  const t = useTranslations("usage.trend")
  const format = useFormatter()
  const chartConfig = {
    signIns: { label: t("signIns"), color: SERIES.signIns },
    activeUsers: { label: t("activeUsers"), color: SERIES.activeUsers },
  } satisfies ChartConfig
  const formatDay = (day: string, options: DateTimeFormatOptions) =>
    format.dateTime(dayDate(day), options)
  const formatCount = (value: number | null) =>
    value === null ? t("notRecorded") : format.number(value)
  const quiet = points.every((point) => !point.signIns && !point.activeUsers)

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex min-h-4 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-4" aria-hidden="true">
          {Object.values(chartConfig).map((series) => (
            <span key={series.label} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-[2px]"
                style={{ backgroundColor: series.color }}
              />
              {series.label}
            </span>
          ))}
        </div>
        {note && <span>{note}</span>}
      </div>
      {quiet ? (
        <div className="flex h-60 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-60 w-full"
          aria-hidden="true"
        >
          <AreaChart
            data={points}
            margin={{ left: 0, right: 8, top: 4 }}
            // The hidden table is the accessible version; the plot takes no focus.
            accessibilityLayer={false}
          >
            <defs>
              {Object.keys(chartConfig).map((key) => (
                <linearGradient
                  key={key}
                  id={`usage-fill-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={`var(--color-${key})`}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(day: string) => formatDay(day, SHORT_DAY)}
            />
            <YAxis
              width={32}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(_, payload) => {
                    const day = payload?.[0]?.payload?.day
                    return typeof day === "string"
                      ? formatDay(day, FULL_DAY)
                      : null
                  }}
                />
              }
            />
            {(["activeUsers", "signIns"] as const).map((key) => (
              <Area
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                fill={`url(#usage-fill-${key})`}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      )}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t("day")}</th>
            <th scope="col">{t("signIns")}</th>
            <th scope="col">{t("activeUsers")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{formatDay(point.day, FULL_DAY)}</th>
              <td>{formatCount(point.signIns)}</td>
              <td>{formatCount(point.activeUsers)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
