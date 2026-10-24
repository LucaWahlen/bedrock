"use server"

import { getFormatter, getTranslations } from "next-intl/server"

import { requireRootAdministration } from "@/features/auth"
import type {
  HealthStatus,
  HousekeepingStatus,
  HousekeepingTaskStatus,
} from "@/features/health/types"
import { db } from "@/features/shared/lib/db/client"
import { systemTaskRun } from "@/features/shared/lib/db/schema"
import { runProbe } from "@/features/shared/lib/health"
import { HOUSEKEEPING_TASKS } from "@/features/shared/lib/housekeeping-tasks"

const HOUR = 60 * 60 * 1000

// Every task is hourly; a daily external schedule (`bedrock housekeep` with
// HOUSEKEEPING_ENABLED=false) is the slowest worth supporting, so a day and an
// hour without a run is a scheduler that stopped.
const STALE_AFTER_MS = 25 * HOUR

// A run still going after this long has most likely died without saying so.
const STUCK_AFTER_MS = HOUR

/**
 * The last run of each housekeeping task, as recorded by the tasks themselves.
 * Root administrators only, rechecked here.
 */
export async function getHousekeepingStatus(): Promise<HousekeepingStatus> {
  const [t, format] = await Promise.all([
    getTranslations("health.housekeeping"),
    getFormatter(),
  ])
  await requireRootAdministration(
    (await getTranslations("health"))("errors.forbidden")
  )

  const outcome = await runProbe(() => db.select().from(systemTaskRun))
  if (outcome.failed) {
    return {
      checkedAt: new Date().toISOString(),
      status: "error",
      detail: outcome.detail,
      latencyMs: outcome.latencyMs,
      tasks: HOUSEKEEPING_TASKS.map((task) => ({
        task,
        status: "never",
        lastStartedAt: null,
        lastFinishedAt: null,
        running: false,
        error: null,
      })),
    }
  }

  const now = Date.now()
  const byTask = new Map(outcome.result.map((row) => [row.task, row]))
  const tasks = HOUSEKEEPING_TASKS.map((task): HousekeepingTaskStatus => {
    const row = byTask.get(task)
    if (!row) {
      return {
        task,
        status: "never",
        lastStartedAt: null,
        lastFinishedAt: null,
        running: false,
        error: null,
      }
    }

    const started = row.lastStartedAt.getTime()
    const running =
      !row.lastFinishedAt || row.lastFinishedAt.getTime() < started
    let status: HealthStatus = "ok"
    if (row.lastOutcome === "failure") status = "error"
    else if (now - started > STALE_AFTER_MS) status = "warning"
    else if (running && now - started > STUCK_AFTER_MS) status = "warning"

    return {
      task,
      status,
      lastStartedAt: row.lastStartedAt.toISOString(),
      lastFinishedAt: row.lastFinishedAt?.toISOString() ?? null,
      running,
      error: row.lastOutcome === "failure" ? row.lastError : null,
    }
  })

  return {
    checkedAt: new Date(now).toISOString(),
    ...summarise(tasks, now, t, format),
    latencyMs: outcome.latencyMs,
    tasks,
  }
}

function summarise(
  tasks: HousekeepingTaskStatus[],
  now: number,
  t: Awaited<ReturnType<typeof getTranslations<"health.housekeeping">>>,
  format: Awaited<ReturnType<typeof getFormatter>>
): { status: HealthStatus; detail: string } {
  const ran = tasks.filter((task) => task.lastStartedAt)
  if (ran.length === 0) {
    return {
      status: "warning",
      detail: t("neverRun"),
    }
  }

  const failed = tasks.filter((task) => task.status === "error")
  if (failed.length > 0) {
    return {
      status: "error",
      detail:
        failed.length === 1 && failed[0]
          ? t("taskFailed", { task: t(`tasks.${failed[0].task}`) })
          : t("tasksFailed", { count: failed.length }),
    }
  }

  const latest = Math.max(
    ...ran.map((task) => new Date(task.lastStartedAt ?? 0).getTime())
  )
  const lastRun = t("lastRun", {
    when: format.relativeTime(new Date(latest), now),
  })
  const attention = tasks.filter((task) => task.status !== "ok")

  return attention.length > 0
    ? {
        status: "warning",
        detail: t("overdue", {
          lastRun,
          attention: attention.length,
          total: tasks.length,
        }),
      }
    : { status: "ok", detail: lastRun }
}
