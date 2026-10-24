import { db } from "@/features/shared/lib/db/client"
import { recordTaskRun, succeededSince } from "@/scripts/housekeeping/task-runs"

// The first key of every housekeeping lock; the second is the task's own.
// Distinct from the setup and migration locks.
export const HOUSEKEEPING_LOCK_NAMESPACE = 1876398543

export type HousekeepingTaskDefinition = {
  name: string
  lockKey: number
  run: () => Promise<unknown>
}

export type HousekeepingOutcome =
  | { status: "succeeded"; result: unknown }
  | { status: "failed"; error: unknown }
  // Another process holds the task's lock, or it succeeded recently enough.
  | { status: "skipped"; reason: "locked" | "recent" }

/**
 * Runs a task unless another process, such as another replica, is running it.
 * The lock is a session advisory lock on a connection reserved for the run,
 * so it is released with the connection even if this process dies. A skipped
 * run is not recorded, so it never shows up as a failure.
 */
export async function runTaskExclusively(
  task: HousekeepingTaskDefinition,
  { skipIfSucceededWithinMs }: { skipIfSucceededWithinMs?: number } = {}
): Promise<HousekeepingOutcome> {
  const connection = await db.$client.reserve()

  try {
    const [lock] = await connection<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${HOUSEKEEPING_LOCK_NAMESPACE}::int, ${task.lockKey}::int) as locked`
    if (!lock?.locked) return { status: "skipped", reason: "locked" }

    try {
      // Replicas each keep an hourly timer; whichever fires first does the
      // work, and the rest find it done.
      if (
        skipIfSucceededWithinMs &&
        (await succeededSince(
          task.name,
          new Date(Date.now() - skipIfSucceededWithinMs)
        ))
      ) {
        return { status: "skipped", reason: "recent" }
      }

      const outcome = await recordTaskRun(task.name, task.run)
      return outcome.ok
        ? { status: "succeeded", result: outcome.result }
        : { status: "failed", error: outcome.error }
    } finally {
      await connection`
        select pg_advisory_unlock(${HOUSEKEEPING_LOCK_NAMESPACE}::int, ${task.lockKey}::int)`.catch(
        () => {}
      )
    }
  } finally {
    connection.release()
  }
}
