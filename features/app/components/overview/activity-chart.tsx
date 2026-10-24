"use client"

import { useFormatter, useTranslations } from "next-intl"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/features/shared/components/ui/chart"

export type ActivityPoint = {
  // An ISO date, UTC.
  day: string
  // Null on a day not yet rolled up, which is unknown rather than zero.
  signIns: number | null
}

// Usage days are UTC dates, so they are labelled in UTC too.
const SHORT_DAY = { month: "short", day: "numeric", timeZone: "UTC" } as const
const FULL_DAY = { dateStyle: "medium", timeZone: "UTC" } as const

const dayDate = (day: string) => new Date(`${day}T00:00:00Z`)

/**
 * Daily sign-ins as one area. The chart is for the eye; a visually hidden table
 * carries the same figures for assistive technology.
 */
export function ActivityChart({ points }: { points: ActivityPoint[] }) {
  const t = useTranslations("app.overview.activity")
  const format = useFormatter()
  const chartConfig = {
    signIns: { label: t("signIns"), color: "var(--primary)" },
  } satisfies ChartConfig
  const quiet = points.every((point) => !point.signIns)

  return (
    <figure className="relative">
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-48 w-full"
        aria-hidden="true"
      >
        <AreaChart
          data={points}
          margin={{ left: 12, right: 12, top: 4 }}
          // The hidden table is the accessible version; the plot takes no focus.
          accessibilityLayer={false}
        >
          <defs>
            <linearGradient id="overview-sign-ins" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-signIns)"
                stopOpacity={0.4}
              />
              <stop
                offset="95%"
                stopColor="var(--color-signIns)"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={(day: string) =>
              format.dateTime(dayDate(day), SHORT_DAY)
            }
          />
          {!quiet && (
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(_, payload) => {
                    const day = payload?.[0]?.payload?.day
                    return typeof day === "string"
                      ? format.dateTime(dayDate(day), FULL_DAY)
                      : null
                  }}
                />
              }
            />
          )}
          <Area
            dataKey="signIns"
            type="monotone"
            stroke="var(--color-signIns)"
            strokeWidth={2}
            fill="url(#overview-sign-ins)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      {quiet && (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}
      <table className="sr-only">
        <caption>{t("caption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("day")}</th>
            <th scope="col">{t("signIns")}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">
                {format.dateTime(dayDate(point.day), FULL_DAY)}
              </th>
              <td>
                {point.signIns === null
                  ? t("notRecorded")
                  : format.number(point.signIns)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
