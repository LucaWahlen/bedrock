import { useTranslations } from "next-intl"

import {
  Card,
  CardContent,
  CardHeader,
} from "@/features/shared/components/ui/card"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

function StatSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-20" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  )
}

function ChartCardSkeleton({ height = "h-60" }: { height?: string }) {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`${height} w-full`} />
      </CardContent>
    </Card>
  )
}

// The report's first screen at the size it renders: the headline cards, the
// activity chart and the row beneath it.
export function UsageReportSkeleton() {
  const t = useTranslations("common.states")

  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-busy="true">
      <output className="sr-only">{t("loading")}</output>
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <StatSkeleton key={index} />
        ))}
      </div>
      <ChartCardSkeleton height="h-72" />
      <div className="grid gap-4 md:gap-6 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
    </div>
  )
}
