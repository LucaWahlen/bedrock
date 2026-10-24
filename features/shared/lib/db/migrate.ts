import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// Arbitrary but stable, and distinct from the initial setup lock. Every
// replica and `bedrock migrate` must agree on it.
export const MIGRATION_LOCK_KEY = 1876398542

export type Migrator = (
  database: PostgresJsDatabase,
  migrationsFolder: string
) => Promise<void>

const drizzleMigrator: Migrator = (database, migrationsFolder) =>
  migrate(database, { migrationsFolder })

/**
 * The migrator itself failed: a broken or conflicting migration, not a
 * database that is merely unreachable. Retrying cannot fix it.
 */
export class MigrationFailedError extends Error {
  constructor(cause: unknown) {
    super("Applying the database migrations failed", { cause })
    this.name = "MigrationFailedError"
  }
}

/**
 * Applies the migrations in `migrationsFolder` while holding a session advisory
 * lock on a dedicated connection. Concurrent callers, such as replicas starting
 * together, queue on the lock; each then runs the migrator, and all but the
 * first find nothing left to apply. A failure to connect or lock is thrown
 * as is, so the caller can retry; a failing migration is a
 * `MigrationFailedError`.
 */
export async function migrateWithLock({
  url,
  migrationsFolder,
  lockKey = MIGRATION_LOCK_KEY,
  migrator = drizzleMigrator,
  whileLocked,
}: {
  url: string
  migrationsFolder: string
  lockKey?: number
  migrator?: Migrator
  // Runs after the migrations, still under the lock, so replicas starting
  // together also take turns at it. Its failure is not a migration failure.
  whileLocked?: () => Promise<void>
}) {
  const client = postgres(url, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  })

  try {
    await client`select pg_advisory_lock(${lockKey}::bigint)`
    try {
      try {
        await migrator(drizzle(client), migrationsFolder)
      } catch (error) {
        throw new MigrationFailedError(error)
      }
      await whileLocked?.()
    } finally {
      // Ending the session releases the lock too, so a connection lost here
      // costs nothing.
      await client`select pg_advisory_unlock(${lockKey}::bigint)`.catch(
        () => {}
      )
    }
  } finally {
    await client.end({ timeout: 5 })
  }
}
