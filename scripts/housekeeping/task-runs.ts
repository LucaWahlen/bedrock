import { and, eq, gte } from "drizzle-orm"

import { db } from "@/features/shared/lib/db/client"
import { systemTaskRun } from "@/features/shared/lib/db/schema"
import { describeFailure } from "@/features/shared/lib/health"

// Bookkeeping must never be why a task fails, so a database that cannot take
// the record only costs the record.
async function record(write: () => Promise<unknown>) {
  try {
    await write()
  } catch (error) {
    console.error("[housekeeping] could not record the run", error)
  }
}

/**
 * Runs one task and keeps its latest run in `system_task_run`: when it started,
 * when it finished, how it went, and what it reported. The error is one short
 * line, redacted, never a stack.
 */
export async function recordTaskRun<T>(
  task: string,
  run: () => Promise<T>
): Promise<{ ok: true; result: T } | { ok: false; error: unknown }> {
  const startedAt = new Date()
  await record(() =>
    db
      .insert(systemTaskRun)
      .values({ task, lastStartedAt: startedAt })
      .onConflictDoUpdate({
        target: systemTaskRun.task,
        set: { lastStartedAt: startedAt },
      })
  )

  try {
    const result = await run()
    await record(() =>
      db
        .update(systemTaskRun)
        .set({
          lastFinishedAt: new Date(),
          lastOutcome: "success",
          lastError: null,
          details: isRecord(result) ? result : null,
        })
        .where(eq(systemTaskRun.task, task))
    )

    return { ok: true, result }
  } catch (error) {
    await record(() =>
      db
        .update(systemTaskRun)
        .set({
          lastFinishedAt: new Date(),
          lastOutcome: "failure",
          lastError: describeFailure(error),
          details: null,
        })
        .where(eq(systemTaskRun.task, task))
    )

    return { ok: false, error }
  }
}

/** Whether the task's latest run succeeded and finished at or after `since`. */
export async function succeededSince(task: string, since: Date) {
  const [row] = await db
    .select({ task: systemTaskRun.task })
    .from(systemTaskRun)
    .where(
      and(
        eq(systemTaskRun.task, task),
        eq(systemTaskRun.lastOutcome, "success"),
        gte(systemTaskRun.lastFinishedAt, since)
      )
    )
    .limit(1)

  return row !== undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
