import type { HousekeepingTask } from "@/features/shared/lib/housekeeping-tasks"
import { housekeepAuditEvents } from "@/scripts/housekeeping/audit-events"
import { housekeepInvitations } from "@/scripts/housekeeping/invitations"
import { housekeepOrganizations } from "@/scripts/housekeeping/organizations"
import { housekeepRateLimits } from "@/scripts/housekeeping/rate-limits"
import type { HousekeepingTaskDefinition } from "@/scripts/housekeeping/run-task"
import { housekeepSessionsAndTokens } from "@/scripts/housekeeping/sessions-and-tokens"
import { housekeepUsage } from "@/scripts/housekeeping/usage"

// Every task is hourly. `lockKey` names the task's advisory lock; keep each
// one unique and never reuse a retired one's.
export const TASKS: (HousekeepingTaskDefinition & {
  name: HousekeepingTask
})[] = [
  { name: "organizations", lockKey: 1, run: housekeepOrganizations },
  { name: "invitations", lockKey: 2, run: housekeepInvitations },
  { name: "rateLimits", lockKey: 3, run: housekeepRateLimits },
  { name: "auditEvents", lockKey: 4, run: housekeepAuditEvents },
  // Recounts yesterday and fills any day missed since; cheap enough hourly,
  // and the sooner after midnight it runs the closer its snapshot is to the
  // end of the day.
  { name: "usage", lockKey: 5, run: () => housekeepUsage() },
  { name: "sessionsAndTokens", lockKey: 6, run: housekeepSessionsAndTokens },
]
