"use client"

import { useFormatter } from "next-intl"
import { Label, Pie, PieChart } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/features/shared/components/ui/chart"
import { ChartDataTable } from "@/features/usage/components/chart-data-table"
import { ChartEmpty } from "@/features/usage/components/chart-empty"
import { paletteColor } from "@/features/usage/utils/chart"

// The total in the middle of the ring. Recharts passes `viewBox` when it
// clones the element.
function DonutCenter({
  viewBox,
  total,
  label,
}: {
  viewBox?: { cx?: number; cy?: number }
  total: string
  label: string
}) {
  if (!viewBox || viewBox.cx === undefined || viewBox.cy === undefined) {
    return null
  }

  return (
    <text
      x={viewBox.cx}
      y={viewBox.cy}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      <tspan
        x={viewBox.cx}
        y={viewBox.cy - 4}
        className="fill-foreground text-2xl font-semibold tabular-nums"
      >
        {total}
      </tspan>
      <tspan
        x={viewBox.cx}
        y={viewBox.cy + 18}
        className="fill-muted-foreground text-xs"
      >
        {label}
      </tspan>
    </text>
  )
}

export type DonutSlice = { key: string; label: string; value: number }

/**
 * A share of a whole, as shadcn's donut with text: the total in the middle,
 * and a legend that carries every figure and its share in plain text.
 */
export function UsageDonutChart({
  slices,
  totalLabel,
  caption,
  columns,
  empty,
}: {
  slices: DonutSlice[]
  totalLabel: string
  caption: string
  // Headers of the hidden table: the slice, its count and its share.
  columns: [string, string, string]
  empty: string
}) {
  const format = useFormatter()
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const chartConfig = Object.fromEntries(
    slices.map((slice, index) => [
      slice.key,
      { label: slice.label, color: paletteColor(index) },
    ])
  ) satisfies ChartConfig
  const data = slices.map((slice) => ({
    ...slice,
    fill: `var(--color-${slice.key})`,
  }))
  const share = (value: number) =>
    format.number(total > 0 ? value / total : 0, {
      style: "percent",
      maximumFractionDigits: 0,
    })

  if (total === 0) return <ChartEmpty>{empty}</ChartEmpty>

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-48"
        aria-hidden="true"
      >
        <PieChart accessibilityLayer={false}>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel nameKey="key" />}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius={58}
            outerRadius={84}
            strokeWidth={4}
            stroke="var(--card)"
            paddingAngle={slices.length > 1 ? 1 : 0}
            isAnimationActive={false}
          >
            <Label
              content={
                <DonutCenter
                  total={format.number(total, { notation: "compact" })}
                  label={totalLabel}
                />
              }
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="flex flex-col gap-2 text-sm" aria-hidden="true">
        {slices.map((slice, index) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: paletteColor(index) }}
            />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {share(slice.value)}
            </span>
            <span className="w-14 text-right font-medium tabular-nums">
              {format.number(slice.value)}
            </span>
          </li>
        ))}
      </ul>
      <ChartDataTable
        caption={caption}
        columns={columns}
        rows={slices.map((slice) => ({
          key: slice.key,
          cells: [slice.label, format.number(slice.value), share(slice.value)],
        }))}
      />
    </div>
  )
}
