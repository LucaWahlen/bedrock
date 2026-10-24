"use client"

import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/features/shared/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/features/shared/components/ui/chart"
import { ChartDataTable } from "@/features/usage/components/chart-data-table"
import { ChartEmpty } from "@/features/usage/components/chart-empty"
import type { ActivityPoint } from "@/features/usage/types"
import { axisDay, dayDate, FULL_DAY, tint } from "@/features/usage/utils/chart"

const SERIES = ["signIns", "activeUsers", "failures"] as const

type Series = (typeof SERIES)[number]

const COLORS: Record<Series, string> = {
  signIns: "var(--primary)",
  activeUsers: tint(55),
  failures: "var(--destructive)",
}

/**
 * Daily activity as shadcn's interactive charts draw it: each series is a
 * button in the header carrying its figure for the period, and toggles the
 * series in the plot. A visually hidden table carries the same figures.
 */
export function UsageActivityChart({
  points,
  totals,
  period,
  empty,
}: {
  points: ActivityPoint[]
  totals: Record<Series, number>
  period: number
  empty: string
}) {
  const t = useTranslations("usage")
  const format = useFormatter()
  const [visible, setVisible] = useState<Set<Series>>(
    () => new Set(["signIns", "activeUsers"])
  )
  const chartConfig = Object.fromEntries(
    SERIES.map((key) => [
      key,
      { label: t(`activity.${key}`), color: COLORS[key] },
    ])
  ) satisfies ChartConfig
  const quiet = points.every(
    (point) => !point.signIns && !point.activeUsers && !point.failures
  )
  const formatCount = (value: number | null) =>
    value === null ? t("chart.notRolledUp") : format.number(value)

  function toggle(key: Series) {
    setVisible((current) => {
      const next = new Set(current)
      if (next.has(key) && next.size > 1) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col items-stretch gap-0 border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-6">
          <CardTitle>
            <h2>{t("activity.title")}</h2>
          </CardTitle>
          <CardDescription>{t("activity.description")}</CardDescription>
        </div>
        <div className="flex">
          {SERIES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={visible.has(key)}
              aria-label={t("activity.toggle", {
                series: t(`activity.${key}`),
              })}
              onClick={() => toggle(key)}
              className="relative flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left outline-none even:border-l hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset aria-pressed:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
            >
              <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: COLORS[key] }}
                  aria-hidden="true"
                />
                {t(`activity.totals.${key}`)}
              </span>
              <span className="text-lg leading-none font-bold tabular-nums sm:text-3xl">
                {format.number(totals[key], { maximumFractionDigits: 1 })}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 pb-4 sm:px-6 sm:pt-6 sm:pb-6">
        {quiet ? (
          <ChartEmpty className="h-62.5">{empty}</ChartEmpty>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-62.5 w-full"
            aria-hidden="true"
          >
            <AreaChart
              data={points}
              margin={{ left: 0, right: 8, top: 4 }}
              accessibilityLayer={false}
            >
              <defs>
                {SERIES.map((key) => (
                  <linearGradient
                    key={key}
                    id={`usage-activity-${key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={`var(--color-${key})`}
                      stopOpacity={key === "signIns" ? 0.5 : 0.35}
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
                minTickGap={32}
                tickFormatter={(day: string) =>
                  format.dateTime(dayDate(day), axisDay(period))
                }
              />
              <YAxis
                width={36}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tickFormatter={(value: number) =>
                  format.number(value, { notation: "compact" })
                }
              />
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
              {SERIES.filter((key) => visible.has(key))
                .toReversed()
                .map((key) => (
                  <Area
                    key={key}
                    dataKey={key}
                    type="monotone"
                    stroke={`var(--color-${key})`}
                    strokeWidth={2}
                    fill={`url(#usage-activity-${key})`}
                    isAnimationActive={false}
                  />
                ))}
            </AreaChart>
          </ChartContainer>
        )}
        <ChartDataTable
          caption={t("activity.caption")}
          columns={[
            t("chart.day"),
            ...SERIES.map((key) => t(`activity.${key}`)),
          ]}
          rows={points.map((point) => ({
            key: point.day,
            cells: [
              format.dateTime(dayDate(point.day), FULL_DAY),
              ...SERIES.map((key) => formatCount(point[key])),
            ],
          }))}
        />
      </CardContent>
    </Card>
  )
}
