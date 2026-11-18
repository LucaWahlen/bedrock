import type { LucideIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { HealthStatusDot } from "@/features/health/components/health-status-dot"
import type { HealthCheckResult } from "@/features/health/types"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

type RowFrameProps = {
  label: string
  icon: LucideIcon
  status: Parameters<typeof HealthStatusDot>[0]["status"]
  detail: React.ReactNode
  latency: React.ReactNode
  children?: React.ReactNode
}

// One frame for the result and its placeholder, so a row never changes size
// when its check comes back.
export function HealthRowFrame({
  label,
  icon: Icon,
  status,
  detail,
  latency,
  children,
}: RowFrameProps) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="grid min-h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5">
        <div className="flex items-center gap-3 self-start pt-0.5 sm:row-span-2 sm:self-center sm:pt-0">
          <HealthStatusDot status={status} />
          <Icon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <span className="min-w-0 text-sm font-medium break-words">{label}</span>
        <div className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:row-span-2 sm:self-center">
          {latency}
        </div>
        <div className="col-span-2 col-start-2 min-w-0 text-sm break-words text-muted-foreground sm:col-span-1">
          {detail}
        </div>
      </div>
      {children}
    </li>
  )
}

export async function HealthCheckRow({
  label,
  icon,
  result,
}: {
  label: string
  icon: LucideIcon
  result: Promise<HealthCheckResult>
}) {
  const [{ status, detail, latencyMs }, t] = await Promise.all([
    result,
    getTranslations("health"),
  ])

  return (
    <HealthRowFrame
      label={label}
      icon={icon}
      status={status}
      detail={detail}
      latency={
        <>
          {t("latency", { ms: latencyMs })}
          <span className="sr-only"> {t("latencyLabel")}</span>
        </>
      }
    />
  )
}

export function HealthCheckRowPlaceholder({
  label,
  icon,
}: {
  label: string
  icon: LucideIcon
}) {
  return (
    <HealthRowFrame
      label={label}
      icon={icon}
      status="pending"
      detail={<Skeleton className="mt-1 h-3.5 w-48 max-w-full" />}
      latency={<Skeleton className="ml-auto h-3.5 w-10" />}
    />
  )
}
