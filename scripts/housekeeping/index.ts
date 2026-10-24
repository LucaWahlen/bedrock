import {
  runTaskExclusively,
  type HousekeepingOutcome,
} from "@/scripts/housekeeping/run-task"
import { logOutcome } from "@/scripts/housekeeping/scheduler"
import { TASKS } from "@/scripts/housekeeping/tasks"

// One pass of every task, then exit: `bun run housekeep` in development and
// `bedrock housekeep` in the image. The server runs the same tasks hourly by
// itself unless HOUSEKEEPING_ENABLED=false. A task another process is running
// right now is skipped, not run twice. Each run is also recorded in
// `system_task_run`, which the Health page reads.
const outcomes = await Promise.all(
  TASKS.map(async (task) => {
    const outcome = await runTaskExclusively(task).catch(
      (error: unknown): HousekeepingOutcome => ({ status: "failed", error })
    )
    logOutcome(task.name, outcome)
    return outcome
  })
)

process.exit(outcomes.some((outcome) => outcome.status === "failed") ? 1 : 0)
