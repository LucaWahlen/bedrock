"use client"

import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"

import { ScrollRegion } from "@/features/shared/components/ui/scroll-region"
import { ChartDataTable } from "@/features/usage/components/chart-data-table"
import { ChartEmpty } from "@/features/usage/components/chart-empty"
import type { SignInHeatmap } from "@/features/usage/types"

// 1 January 2024 was a Monday, so day `d` of the grid is 2024-01-(d + 1).
const weekdayDate = (weekday: number) =>
  new Date(Date.UTC(2024, 0, 1 + weekday))
const hourDate = (hour: number) => new Date(Date.UTC(2024, 0, 1, hour))

const LEVELS = [0, 18, 36, 62, 100]

/**
 * Successful sign-ins by weekday and UTC hour, each cell shaded by its share
 * of the busiest one. Pointing at a cell names its count; the hidden table
 * carries every count for assistive technology.
 */
export function UsageHeatmap({
  grid,
  empty,
}: {
  grid: SignInHeatmap
  empty: string
}) {
  const t = useTranslations("usage.heatmap")
  const format = useFormatter()
  const [hovered, setHovered] = useState<[number, number] | null>(null)

  const largest = Math.max(...grid.flat(), 0)
  if (largest === 0) return <ChartEmpty>{empty}</ChartEmpty>

  const weekday = (day: number, style: "short" | "long" = "short") =>
    format.dateTime(weekdayDate(day), { weekday: style, timeZone: "UTC" })
  const hour = (value: number) =>
    format.dateTime(hourDate(value), { hour: "numeric", timeZone: "UTC" })
  const level = (count: number) =>
    count === 0 ? 0 : Math.max(1, Math.ceil((count / largest) * 4))
  const shade = (step: number) =>
    step === 0
      ? "var(--muted)"
      : `color-mix(in oklch, var(--primary) ${LEVELS[step]}%, var(--muted))`
  const describe = (day: number, at: number) =>
    t("cell", {
      weekday: weekday(day, "long"),
      hour: hour(at),
      count: grid[day]?.[at] ?? 0,
    })

  let busiest: [number, number] = [0, 0]
  grid.forEach((hours, day) =>
    hours.forEach((count, at) => {
      if (count > (grid[busiest[0]]?.[busiest[1]] ?? 0)) busiest = [day, at]
    })
  )

  return (
    <div className="flex flex-col gap-3">
      <ScrollRegion className="group/heatmap">
        <div
          aria-hidden="true"
          className="grid min-w-md grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-0.5 group-data-has-overflow-x/heatmap:pb-2.5"
          onMouseLeave={() => setHovered(null)}
        >
          {grid.map((hours, day) => (
            <div key={day} className="contents">
              <span className="pr-2 text-xs leading-6 text-muted-foreground">
                {weekday(day)}
              </span>
              {hours.map((count, at) => (
                <span
                  key={at}
                  onMouseEnter={() => setHovered([day, at])}
                  className="h-6 rounded-[3px] transition-shadow hover:ring-2 hover:ring-ring/60"
                  style={{ backgroundColor: shade(level(count)) }}
                />
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, at) => (
            <span
              key={at}
              className="pt-1 text-center text-[10px] text-muted-foreground tabular-nums"
            >
              {at % 6 === 0 ? hour(at) : ""}
            </span>
          ))}
        </div>
      </ScrollRegion>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="min-h-4">
          {hovered
            ? describe(hovered[0], hovered[1])
            : t("busiest", {
                weekday: weekday(busiest[0], "long"),
                hour: hour(busiest[1]),
              })}
        </span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {t("fewer")}
          {LEVELS.map((_, step) => (
            <span
              key={step}
              className="size-3 rounded-[3px]"
              style={{ backgroundColor: shade(step) }}
            />
          ))}
          {t("more")}
        </span>
      </div>
      <ChartDataTable
        caption={t("caption")}
        columns={[t("weekday"), ...grid[0]!.map((_, at) => hour(at))]}
        rows={grid.map((hours, day) => ({
          key: String(day),
          cells: [weekday(day, "long"), ...hours.map((n) => format.number(n))],
        }))}
      />
    </div>
  )
}
