import { describeFailure } from "@/features/shared/lib/health"
import {
  runTaskExclusively,
  type HousekeepingOutcome,
  type HousekeepingTaskDefinition,
} from "@/scripts/housekeeping/run-task"
import { TASKS } from "@/scripts/housekeeping/tasks"

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const globalForHousekeeping = globalThis as typeof globalThis & {
  bedrockHousekeepingStarted?: boolean
}

export function logOutcome(task: string, outcome: HousekeepingOutcome) {
  if (outcome.status === "succeeded") {
    console.log(`[housekeeping] ${task}`, outcome.result)
  } else if (outcome.status === "failed") {
    console.error(`[housekeeping] ${task} failed`, outcome.error)
  } else if (outcome.reason === "locked") {
    console.log(`[housekeeping] ${task} skipped: another process is running it`)
  }
}

/**
 * Runs every housekeeping task in this process: each first a minute or two
 * after start-up, then an hour after its previous run finished, so a slow run
 * delays the next instead of overlapping it. Replicas share the work through
 * the advisory locks in `runTaskExclusively`. Timers are unref'd and never keep
 * the process alive.
 */
export function startHousekeeping({
  tasks = TASKS,
  intervalMs = HOUR,
  firstRunAfterMs = MINUTE,
}: {
  tasks?: HousekeepingTaskDefinition[]
  intervalMs?: number
  firstRunAfterMs?: number
} = {}) {
  if (globalForHousekeeping.bedrockHousekeepingStarted) return
  globalForHousekeeping.bedrockHousekeepingStarted = true

  for (const task of tasks) {
    const tick = async () => {
      try {
        logOutcome(
          task.name,
          await runTaskExclusively(task, {
            skipIfSucceededWithinMs: intervalMs * 0.9,
          })
        )
      } catch (error) {
        // The database was unreachable before the task could start.
        console.error(
          `[housekeeping] ${task.name} could not start: ${describeFailure(error)}`
        )
      }
      setTimeout(tick, intervalMs).unref()
    }

    // Spread out, so replicas started together do not all reach for the
    // same lock in the same second.
    setTimeout(tick, firstRunAfterMs * (1 + Math.random())).unref()
  }
}
