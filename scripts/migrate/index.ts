import { fileURLToPath } from "node:url"

import { migrateWithLock } from "@/features/shared/lib/db/migrate"

// Applies the committed migrations in `drizzle/` with drizzle-orm's own
// migrator, under the same advisory lock the server takes when it migrates on
// start, so the two never run at once. `bedrock migrate` in the image; for
// deployments that set MIGRATE_ON_START=false and migrate themselves.
//
// Only the database is needed here, so DATABASE_URL is read directly when set
// and the full environment is not required. Locally it falls back to the
// development default in env.ts.
const url =
  process.env.DATABASE_URL ??
  (await import("@/features/shared/lib/config/env")).env.database.url

// Two levels up from both `scripts/migrate/` and the bundled `dist/cli/`.
const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url)
)

try {
  await migrateWithLock({ url, migrationsFolder })
  console.log("[migrate] database is up to date")
} catch (error) {
  console.error("[migrate] failed", error)
  process.exitCode = 1
}
