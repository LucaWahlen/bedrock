import { useTranslations } from "next-intl"

import {
  MetricGrid,
  metricCardClassName,
} from "@/features/app/components/overview/metric-card"
import { StatGrid } from "@/features/app/components/overview/stat-card"
import {
  Card,
  CardFooter,
  CardHeader,
} from "@/features/shared/components/ui/card"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

export function StatGridSkeleton({
  count,
  hint = false,
}: {
  count: number
  // Reserves the line a card's hint takes, for grids whose cards all have one.
  hint?: boolean
}) {
  return (
    <StatGrid>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="gap-3 px-4 py-4" aria-hidden="true">
          <Skeleton className="h-5 w-24" />
          <div className="flex flex-col gap-0.5">
            <Skeleton className="h-6 w-16" />
            {hint && <Skeleton className="mt-0.5 h-3.5 w-32" />}
          </div>
        </Card>
      ))}
    </StatGrid>
  )
}

// Line for line the height of a metric card: label, value, two footer lines.
export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  const t = useTranslations("common.states")

  return (
    <div aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <MetricGrid>
        {Array.from({ length: count }, (_, index) => (
          <Card key={index} className={metricCardClassName} aria-hidden="true">
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-20 @[250px]/card:h-9" />
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 border-t-0 bg-transparent pt-0">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-32" />
            </CardFooter>
          </Card>
        ))}
      </MetricGrid>
    </div>
  )
}

// The chart's own height, under the header its card renders at once.
export function ChartSkeleton() {
  return <Skeleton className="h-48 w-full" aria-hidden="true" />
}

// Rows the height of the overview's lists: an avatar beside two lines.
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  const t = useTranslations("common.states")

  return (
    <div className="-mx-2 flex flex-col" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 px-2 py-2"
          aria-hidden="true"
        >
          <Skeleton className="size-8 shrink-0" />
          <div className="flex flex-1 flex-col">
            <Skeleton className="my-0.5 h-4 w-2/5" />
            <Skeleton className="my-0.5 h-3 w-1/4" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}

// Application tiles, two to a row from small screens up.
export function TileSkeleton({ count = 4 }: { count?: number }) {
  const t = useTranslations("common.states")

  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-foreground/10"
          aria-hidden="true"
        >
          <Skeleton className="size-8 shrink-0" />
          <div className="flex flex-1 flex-col">
            <Skeleton className="my-0.5 h-4 w-1/2" />
            <Skeleton className="my-0.5 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
