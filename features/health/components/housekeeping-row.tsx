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

// Each task is one line of fixed height, so the placeholder and the result
// occupy exactly the same space.
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
    <li className="flex h-5 items-center gap-2 text-xs">
      <HealthStatusDot status={status} size="sm" />
      <span className="shrink-0">{t(task)}</span>
      <span
        className="min-w-0 flex-1 truncate text-muted-foreground"
        title={note ?? undefined}
      >
        {note}
      </span>
      <div className="shrink-0 text-muted-foreground tabular-nums">{when}</div>
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
      detail={<span title={detail}>{detail}</span>}
      latency={
        <>
          {t("latency", { ms: latencyMs })}
          <span className="sr-only"> {t("latencyLabel")}</span>
        </>
      }
    >
      <ul className="ml-12.5 flex flex-col gap-1">
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
      detail={<Skeleton className="mt-1 h-3.5 w-48" />}
      latency={<Skeleton className="ml-auto h-3.5 w-10" />}
    >
      <ul className="ml-12.5 flex flex-col gap-1">
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
