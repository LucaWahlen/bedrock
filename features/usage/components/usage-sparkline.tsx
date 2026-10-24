"use client"

import { Area, AreaChart } from "recharts"

import {
  ChartContainer,
  type ChartConfig,
} from "@/features/shared/components/ui/chart"

const chartConfig = {
  value: { color: "var(--primary)" },
} satisfies ChartConfig

/**
 * A row's daily trend at a glance. Decorative: the row it sits in states the
 * figures it summarises.
 */
export function UsageSparkline({ values }: { values: number[] }) {
  const data = values.map((value, index) => ({ index, value }))

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto h-8 w-24"
      initialDimension={{ width: 96, height: 32 }}
      aria-hidden="true"
    >
      <AreaChart
        data={data}
        margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
        accessibilityLayer={false}
      >
        <defs>
          <linearGradient id="usage-sparkline" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-value)"
              stopOpacity={0.35}
            />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={1.5}
          fill="url(#usage-sparkline)"
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
