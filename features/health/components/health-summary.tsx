import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { getFormatter, getTranslations } from "next-intl/server"

import type { HealthStatus } from "@/features/health/types"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

function SummaryFrame({
  icon,
  headline,
  detail,
}: {
  icon: React.ReactNode
  headline: React.ReactNode
  detail: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="grid min-w-0">
        <div className="h-6 truncate text-base font-semibold">{headline}</div>
        <div className="h-5 truncate text-sm text-muted-foreground">
          {detail}
        </div>
      </div>
    </div>
  )
}

/**
 * The verdict over every check, in a sentence. It waits on the same results
 * the rows show, so it never disagrees with them.
 */
export async function HealthSummary({
  results,
}: {
  results: Promise<{ status: HealthStatus }>[]
}) {
  const [settled, t, format] = await Promise.all([
    Promise.all(results),
    getTranslations("health.summary"),
    getFormatter(),
  ])
  const statuses = settled.map((result) => result.status)
  const failing = statuses.filter((status) => status === "error").length
  const attention = statuses.filter((status) => status !== "ok").length
  // Rendered on the server, once per request, so the zone is said rather than
  // assumed and reading the clock here is the point.
  // oxlint-disable-next-line react/purity
  const checkedAt = format.dateTime(new Date(), {
    timeStyle: "medium",
    timeZone: "UTC",
  })

  return (
    <SummaryFrame
      icon={
        failing > 0 ? (
          <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
        ) : attention > 0 ? (
          <TriangleAlert className="size-5 text-amber-500" aria-hidden="true" />
        ) : (
          <CircleCheck className="size-5 text-emerald-500" aria-hidden="true" />
        )
      }
      headline={
        attention === 0
          ? t("operational")
          : t("attention", { count: attention })
      }
      detail={t("checkedAt", { time: checkedAt })}
    />
  )
}

export function HealthSummaryPlaceholder() {
  const t = useTranslations("health.summary")

  return (
    <SummaryFrame
      icon={<Skeleton className="size-5 rounded-full" />}
      headline={t("checking")}
      detail={<Skeleton className="mt-1 h-3.5 w-32" />}
    />
  )
}
