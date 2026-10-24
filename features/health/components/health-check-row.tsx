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
      <div className="flex h-10 items-center gap-3">
        <HealthStatusDot status={status} />
        <Icon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="grid min-w-0 flex-1">
          <span className="text-sm font-medium">{label}</span>
          <div className="truncate text-sm text-muted-foreground">{detail}</div>
        </div>
        <div className="w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {latency}
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
      detail={<span title={detail}>{detail}</span>}
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
      detail={<Skeleton className="mt-1 h-3.5 w-48" />}
      latency={<Skeleton className="ml-auto h-3.5 w-10" />}
    />
  )
}
