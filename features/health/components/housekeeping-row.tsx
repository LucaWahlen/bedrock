import { CalendarClock } from "lucide-react"
import { useTranslations } from "next-intl"
import { getFormatter, getTranslations } from "next-intl/server"

import { HealthRowFrame } from "@/features/health/components/health-check-row"
import { HealthStatusDot } from "@/features/health/components/health-status-dot"
import type { HousekeepingStatus } from "@/features/health/types"
import { Skeleton } from "@/features/shared/components/ui/skeleton"
import {
  HOUSEKEEPING_TASKS,
  type HousekeepingTask,
} from "@/features/shared/lib/housekeeping-tasks"

// Each task occupies one compact row when healthy, wrapping cleanly on narrow
// screens rather than clipping against the card edge.
function TaskLine({
  task,
  status,
  note,
  when,
}: {
  task: HousekeepingTask
  status: Parameters<typeof HealthStatusDot>[0]["status"]
  note?: string | null
  when: React.ReactNode
}) {
  const t = useTranslations("health.housekeeping.tasks")

  return (
    <li className="flex min-h-5 flex-col gap-0.5 text-xs">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <HealthStatusDot status={status} size="sm" />
          <span className="min-w-0 break-words">{t(task)}</span>
        </div>
        <div className="shrink-0 text-muted-foreground tabular-nums">
          {when}
        </div>
      </div>
      {note && (
        <p className="pl-3.5 break-words text-muted-foreground">{note}</p>
      )}
    </li>
  )
}

export async function HousekeepingRow({
  status,
}: {
  status: Promise<HousekeepingStatus>
}) {
  const [{ checkedAt, status: overall, detail, latencyMs, tasks }, t, format] =
    await Promise.all([status, getTranslations("health"), getFormatter()])
  const now = new Date(checkedAt)

  return (
    <HealthRowFrame
      label={t("housekeeping.label")}
      icon={CalendarClock}
      status={overall}
      detail={detail}
      latency={
        <>
          {t("latency", { ms: latencyMs })}
          <span className="sr-only"> {t("latencyLabel")}</span>
        </>
      }
    >
      <ul className="ml-6 flex flex-col gap-1.5 sm:ml-12.5 sm:gap-1">
        {tasks.map((task) => (
          <TaskLine
            key={task.task}
            task={task.task}
            status={task.status}
            note={task.error}
            when={
              !task.lastStartedAt
                ? t("housekeeping.never")
                : task.running
                  ? t("housekeeping.runningSince", {
                      when: format.relativeTime(
                        new Date(task.lastStartedAt),
                        now
                      ),
                    })
                  : format.relativeTime(
                      new Date(task.lastFinishedAt ?? task.lastStartedAt),
                      now
                    )
            }
          />
        ))}
      </ul>
    </HealthRowFrame>
  )
}

export function HousekeepingRowPlaceholder() {
  const t = useTranslations("health.housekeeping")

  return (
    <HealthRowFrame
      label={t("label")}
      icon={CalendarClock}
      status="pending"
      detail={<Skeleton className="mt-1 h-3.5 w-48 max-w-full" />}
      latency={<Skeleton className="ml-auto h-3.5 w-10" />}
    >
      <ul className="ml-6 flex flex-col gap-1.5 sm:ml-12.5 sm:gap-1">
        {HOUSEKEEPING_TASKS.map((task) => (
          <TaskLine
            key={task}
            task={task}
            status="pending"
            when={<Skeleton className="h-3 w-12" />}
          />
        ))}
      </ul>
    </HealthRowFrame>
  )
}
