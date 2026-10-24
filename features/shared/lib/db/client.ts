import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { env } from "@/features/shared/lib/config/env"
import * as schema from "@/features/shared/lib/db/schema"

const globalForDb = globalThis as typeof globalThis & {
  bedrockDatabaseClient?: ReturnType<typeof postgres>
}

// A hot reload re-evaluates this module. Without caching the client, every
// reload opens another pool and leaves the previous one connected, until
// Postgres refuses new clients and the whole app fails to read a session.
const client = globalForDb.bedrockDatabaseClient ?? postgres(env.database.url)

if (process.env.NODE_ENV !== "production") {
  globalForDb.bedrockDatabaseClient = client
}

export const db = drizzle(client, { schema })
