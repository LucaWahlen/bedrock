import path from "node:path"

import { ensureInitialSetup } from "@/features/organizations"
import { env } from "@/features/shared/lib/config/env"
import {
  MigrationFailedError,
  migrateWithLock,
} from "@/features/shared/lib/db/migrate"
import { refuseToStart } from "@/features/shared/lib/refuse-to-start"
import { markStartupComplete } from "@/features/shared/lib/startup"

const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 60_000

// Node.js-only startup, imported from `instrumentation.ts` inside its
// `nodejs` branch so the database, seeding and the OpenTelemetry SDK never
// reach the Edge bundle.
export async function startNodeRuntime() {
  // Nothing to set up while `next build` collects page data.
  if (process.env.NEXT_PHASE === "phase-production-build") return

  // Opt-in: without an endpoint no SDK is loaded and every metric is a no-op.
  // Observability failing to start is no reason for the application not to.
  if (env.telemetry.endpoint) {
    try {
      const { startTelemetry } =
        await import("@/features/shared/lib/telemetry/node")
      startTelemetry(env.telemetry.serviceName)
    } catch (error) {
      console.error("OpenTelemetry failed to start:", error)
    }
  }

  let migrated = !env.database.migrateOnStart

  // Migrations first, under an advisory lock so one replica applies them while
  // the others wait, then the root organization and first owner, and only
  // then the hourly housekeeping.
  async function setUp() {
    if (migrated) {
      await ensureInitialSetup()
    } else {
      await migrateWithLock({
        url: env.database.url,
        // The standalone server runs from the image's /app, which ships
        // `drizzle/`; `next dev` runs from the repository root.
        migrationsFolder: path.join(process.cwd(), "drizzle"),
        // Replicas booting an empty database together would otherwise race
        // to seed the first owner. That race is safe, but it logs an error.
        whileLocked: async () => {
          migrated = true
          console.log("Database migrations are up to date")
          await ensureInitialSetup()
        },
      })
    }
    markStartupComplete()

    if (env.housekeeping.enabled) {
      const { startHousekeeping } =
        await import("@/scripts/housekeeping/scheduler")
      startHousekeeping()
    }
  }

  // Next keeps a failed hook until restart, so a database that is not up yet
  // would leave every page a bare 500. Retry in the background instead; until
  // then /api/ready answers 503. A failing migration is not retried: the first
  // attempt throws to the hook, and a later one stops a production server here.
  // Development keeps serving, unready, until restarted.
  async function attempt(retryInMs: number, background: boolean) {
    try {
      await setUp()
    } catch (error) {
      if (error instanceof MigrationFailedError) {
        if (!background) throw error
        if (process.env.NODE_ENV === "production") refuseToStart(error)
        console.error("Start-up failed; fix it and restart:", error)
        return
      }

      console.error(
        `Initial setup failed, retrying in ${retryInMs / 1000}s:`,
        error
      )
      setTimeout(
        () => void attempt(Math.min(retryInMs * 2, MAX_RETRY_MS), true),
        retryInMs
      ).unref()
    }
  }

  await attempt(FIRST_RETRY_MS, false)
}
