// The housekeeping tasks, by the name each records its last run under in
// `system_task_run`. Shared so the Health page can tell a task that never ran
// from one it has not heard of.
export const HOUSEKEEPING_TASKS = [
  "organizations",
  "invitations",
  "rateLimits",
  "auditEvents",
  "usage",
  "sessionsAndTokens",
] as const

export type HousekeepingTask = (typeof HOUSEKEEPING_TASKS)[number]
