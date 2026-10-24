import { afterAll, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"
import postgres from "postgres"

import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import {
  MigrationFailedError,
  migrateWithLock,
} from "@/features/shared/lib/db/migrate"
import { systemTaskRun } from "@/features/shared/lib/db/schema"
import {
  HOUSEKEEPING_LOCK_NAMESPACE,
  runTaskExclusively,
} from "@/scripts/housekeeping/run-task"

// Keys far from the real ones, so a running dev server is never blocked. The
// migrator is replaced: nothing here touches the database's migrations.
const suffix = crypto.randomUUID().slice(0, 8)
const migrationLockKey = 900_000_000 + Math.floor(Math.random() * 1_000_000)
const taskLockKey = 900_000 + Math.floor(Math.random() * 1_000)
const task = `test-lock-${suffix}`

const other = postgres(env.database.url, { max: 1, onnotice: () => {} })

afterAll(async () => {
  await db.delete(systemTaskRun).where(eq(systemTaskRun.task, task))
  await other.end()
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("migrating on start", () => {
  test("concurrent callers each migrate, one at a time", async () => {
    const spans: { start: number; end: number }[] = []
    const migrator = async () => {
      const start = performance.now()
      await sleep(150)
      spans.push({ start, end: performance.now() })
    }

    await Promise.all(
      [1, 2].map(() =>
        migrateWithLock({
          url: env.database.url,
          migrationsFolder: "unused",
          lockKey: migrationLockKey,
          migrator,
        })
      )
    )

    expect(spans).toHaveLength(2)
    const [first, second] = spans.toSorted((a, b) => a.start - b.start)
    expect(second!.start).toBeGreaterThanOrEqual(first!.end)
  })

  test("a failing migration is fatal and releases the lock", async () => {
    const failing = migrateWithLock({
      url: env.database.url,
      migrationsFolder: "unused",
      lockKey: migrationLockKey,
      migrator: async () => {
        throw new Error("broken migration")
      },
    })
    await expect(failing).rejects.toBeInstanceOf(MigrationFailedError)

    const [row] = await other<{ locked: boolean }[]>`
      select pg_try_advisory_lock(${migrationLockKey}::bigint) as locked`
    expect(row?.locked).toBe(true)
    await other`select pg_advisory_unlock(${migrationLockKey}::bigint)`
  })

  test("an unreachable database is not a migration failure", async () => {
    const unreachable = migrateWithLock({
      url: "postgres://nobody:nothing@127.0.0.1:1/none",
      migrationsFolder: "unused",
      lockKey: migrationLockKey,
      migrator: async () => {},
    })
    const error = await unreachable.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(MigrationFailedError)
  })
})

describe("housekeeping across replicas", () => {
  test("a task another session holds is skipped and not recorded", async () => {
    let runs = 0
    const definition = {
      name: task,
      lockKey: taskLockKey,
      run: async () => {
        runs += 1
        return { done: true }
      },
    }

    await other`
      select pg_advisory_lock(${HOUSEKEEPING_LOCK_NAMESPACE}::int, ${taskLockKey}::int)`
    try {
      expect(await runTaskExclusively(definition)).toEqual({
        status: "skipped",
        reason: "locked",
      })
      expect(runs).toBe(0)
      expect(
        await db
          .select()
          .from(systemTaskRun)
          .where(eq(systemTaskRun.task, task))
      ).toHaveLength(0)
    } finally {
      await other`
        select pg_advisory_unlock(${HOUSEKEEPING_LOCK_NAMESPACE}::int, ${taskLockKey}::int)`
    }

    expect(await runTaskExclusively(definition)).toEqual({
      status: "succeeded",
      result: { done: true },
    })
    expect(runs).toBe(1)

    // Another replica's timer firing right after finds it done.
    expect(
      await runTaskExclusively(definition, { skipIfSucceededWithinMs: 60_000 })
    ).toEqual({ status: "skipped", reason: "recent" })
    expect(runs).toBe(1)

    const [row] = await db
      .select()
      .from(systemTaskRun)
      .where(eq(systemTaskRun.task, task))
    expect(row?.lastOutcome).toBe("success")
  })
})
