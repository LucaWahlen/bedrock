import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@/features/shared/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/features/shared/components/ui/card"
import { cn } from "@/features/shared/lib/ui/utils"

export type MetricTrend = {
  direction: "up" | "down" | "flat"
  // The signed change, such as "+12%" or "−3 pts".
  change: string
}

export type Metric = {
  label: string
  value: string
  // Null when there is nothing to compare with.
  trend: MetricTrend | null
  // How it compares, in words.
  summary: string
  // What the figure counts.
  detail: string
}

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const

// Shared with the skeleton, so both take the same size at every width.
export const metricCardClassName = "@container/card h-full"

export function MetricGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  )
}

/**
 * One figure and how it compares with the week before. The whole card links to
 * where the figure is explained. Hovering only darkens its ring, at once: an
 * animated background on a rounded, clipped card is what made the edges flash.
 */
export function MetricCard({ metric, href }: { metric: Metric; href: string }) {
  const TrendIcon = metric.trend ? TREND_ICONS[metric.trend.direction] : null

  return (
    <Link
      href={href}
      className="group/metric rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Card
        className={cn(
          metricCardClassName,
          "group-hover/metric:ring-foreground/20"
        )}
      >
        <CardHeader>
          <CardDescription>{metric.label}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metric.value}
          </CardTitle>
          {metric.trend && TrendIcon && (
            <CardAction>
              <Badge variant="outline" className="tabular-nums">
                <TrendIcon aria-hidden="true" />
                {metric.trend.change}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 border-t-0 bg-transparent pt-0 text-sm">
          <div className="flex max-w-full items-center gap-2 font-medium">
            <span className="truncate">{metric.summary}</span>
            {TrendIcon && (
              <TrendIcon className="size-4 shrink-0" aria-hidden="true" />
            )}
          </div>
          <div className="max-w-full truncate text-muted-foreground">
            {metric.detail}
          </div>
        </CardFooter>
      </Card>
    </Link>
  )
}
