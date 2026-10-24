import type { HousekeepingTask } from "@/features/shared/lib/housekeeping-tasks"

export const HEALTH_CHECKS = [
  "database",
  "storage",
  "email",
  "signingKeys",
] as const

export type HealthCheckKind = (typeof HEALTH_CHECKS)[number]

// "warning" works but wants an operator's attention; "error" does not work.
export type HealthStatus = "ok" | "warning" | "error"

export type HealthCheckResult = {
  status: HealthStatus
  // One line, never a secret: no credential, key material or full URL.
  detail: string
  latencyMs: number
}

export type HousekeepingTaskStatus = {
  task: HousekeepingTask
  status: HealthStatus | "never"
  lastStartedAt: string | null
  lastFinishedAt: string | null
  running: boolean
  // The recorded failure, already redacted when it was written.
  error: string | null
}

export type HousekeepingStatus = {
  // When the runs were read, which their ages are measured from.
  checkedAt: string
  status: HealthStatus
  detail: string
  latencyMs: number
  tasks: HousekeepingTaskStatus[]
}

export type ConfigurationNotice = {
  id: string
  severity: "warning" | "info"
  title: string
  description: string
}

export type SystemConfiguration = {
  notices: ConfigurationNotice[]
  build: {
    version: string
    nextVersion: string
    commit: string | null
  }
}
