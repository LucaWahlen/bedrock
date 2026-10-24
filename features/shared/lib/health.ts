import { HeadBucketCommand } from "@aws-sdk/client-s3"
import { sql } from "drizzle-orm"

import journal from "@/drizzle/meta/_journal.json"
import { db } from "@/features/shared/lib/db/client"
import { verifySmtpConnection } from "@/features/shared/lib/email/smtp-transport"
import { isStartupComplete } from "@/features/shared/lib/startup"
import { getObjectStorage } from "@/features/shared/lib/storage/s3"

// Infrastructure probes, not application queries: they read no tenant data and
// only answer whether a dependency is reachable. Results carry error messages
// and migration names, so return them only to a root administrator; anonymous
// callers get `isReady()` and nothing else.

const CHECK_TIMEOUT_MS = 5_000

export type HealthCheckName = "database" | "migrations" | "storage" | "email"

export type HealthCheck = {
  name: HealthCheckName
  ok: boolean
  latencyMs: number
  detail?: string
}

export type MigrationStatus = {
  applied: number
  expected: number
  pending: string[]
}

export type SystemHealth = {
  ok: boolean
  checkedAt: string
  checks: HealthCheck[]
}

function withTimeout<T>(promise: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Timed out"))
    if (signal.aborted) return abort()
    signal.addEventListener("abort", abort, { once: true })
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort)
    })
  })
}

export type ProbeOutcome<T> = { latencyMs: number } & (
  | { failed: false; result: T }
  | { failed: true; detail: string }
)

/**
 * Runs one probe under the shared timeout and measures it. A thrown error or a
 * timeout becomes a failure whose detail is the cause, redacted.
 */
export async function runProbe<T>(
  probe: (signal: AbortSignal) => Promise<T>
): Promise<ProbeOutcome<T>> {
  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS)
  const started = performance.now()

  try {
    const result = await withTimeout(probe(signal), signal)
    return { failed: false, result, latencyMs: elapsed(started) }
  } catch (error) {
    return {
      failed: true,
      detail: redactDetail(describeError(error)),
      latencyMs: elapsed(started),
    }
  }
}

async function runCheck(
  name: HealthCheckName,
  probe: (signal: AbortSignal) => Promise<{ ok: boolean; detail?: string }>
): Promise<HealthCheck> {
  const outcome = await runProbe(probe)

  return outcome.failed
    ? { name, ok: false, latencyMs: outcome.latencyMs, detail: outcome.detail }
    : { name, latencyMs: outcome.latencyMs, ...outcome.result }
}

// Driver messages can quote a connection string. Credentials in a URL are cut
// out, and the rest is kept short enough to never carry a payload.
export function redactDetail(detail: string) {
  const redacted = detail.replace(/\/\/[^/\s@]+@/g, "//***@")
  return redacted.length > 200 ? `${redacted.slice(0, 199)}…` : redacted
}

// Drizzle wraps a driver error as "Failed query: …", which names the query but
// not why it failed.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  if (error.cause instanceof Error) return describeError(error.cause)
  // A refused connection can arrive with an empty message and only a code.
  if (error.message) return error.message
  return "code" in error && typeof error.code === "string"
    ? error.code
    : error.name
}

/** A failure as one short line, safe to store and show to an operator. */
export function describeFailure(error: unknown) {
  return redactDetail(describeError(error))
}

function elapsed(started: number) {
  return Math.round(performance.now() - started)
}

/**
 * Compares what the migrator recorded against the journal this build shipped
 * with, the same way drizzle's migrator decides what is still to run.
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  const [row] = await db.execute<{ applied: number; latest: string | null }>(
    sql`select count(*)::int as applied, max(created_at)::text as latest from drizzle.__drizzle_migrations`
  )
  const latest = row?.latest ? Number(row.latest) : -Infinity

  return {
    applied: row?.applied ?? 0,
    expected: journal.entries.length,
    pending: journal.entries
      .filter((entry) => entry.when > latest)
      .map((entry) => entry.tag),
  }
}

export function checkDatabase() {
  return runCheck("database", async () => {
    await db.execute(sql`select 1`)
    return { ok: true }
  })
}

export function checkMigrations() {
  return runCheck("migrations", async () => {
    const status = await getMigrationStatus()
    return status.pending.length === 0
      ? { ok: true, detail: `${status.applied} applied` }
      : { ok: false, detail: `Pending: ${status.pending.join(", ")}` }
  })
}

export function checkStorage() {
  return runCheck("storage", async (signal) => {
    const { client, bucket } = getObjectStorage()
    await client.send(new HeadBucketCommand({ Bucket: bucket }), {
      abortSignal: signal,
    })
    return { ok: true }
  })
}

export function checkEmail() {
  return runCheck("email", async () => {
    await verifySmtpConnection()
    return { ok: true }
  })
}

/**
 * Readiness: start-up has migrated and set up the instance, and the database
 * answers and carries every migration this build expects. Storage and email
 * are left out on purpose, since an outage there should not pull every
 * instance out of the load balancer.
 */
export async function isReady() {
  if (!isStartupComplete()) return false

  const migrations = await checkMigrations()
  return migrations.ok
}

/** Every dependency at once, for an authorized operator view. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const checks = await Promise.all([
    checkDatabase(),
    checkMigrations(),
    checkStorage(),
    checkEmail(),
  ])

  return {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
  }
}
