import { afterAll, describe, expect, test } from "bun:test"

import { eq } from "drizzle-orm"

import { getHousekeepingStatus } from "@/features/health/actions/get-housekeeping-status"
import { getSystemConfiguration } from "@/features/health/actions/get-system-configuration"
import { runHealthCheck } from "@/features/health/actions/run-health-check"
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/features/shared/lib/authorization-error"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { systemTaskRun } from "@/features/shared/lib/db/schema"
import { recordTaskRun } from "@/scripts/housekeeping/task-runs"
import { createFixture } from "@/tests/support/fixtures"
import { actAs } from "@/tests/support/request"

const fixture = await createFixture("health")
const { rootOwner, alice, carol, suffix } = fixture
const task = `test-health-${suffix}`

afterAll(async () => {
  await db.delete(systemTaskRun).where(eq(systemTaskRun.task, task))
  await fixture.cleanup()
})

describe("health reads", () => {
  test("a tenant owner or member is refused every one", async () => {
    for (const person of [alice, carol]) {
      await actAs(person)
      await expect(runHealthCheck("database")).rejects.toBeInstanceOf(
        ForbiddenError
      )
      await expect(getHousekeepingStatus()).rejects.toBeInstanceOf(
        ForbiddenError
      )
      await expect(getSystemConfiguration()).rejects.toBeInstanceOf(
        ForbiddenError
      )
    }
  })

  test("a visitor is not signed in", async () => {
    await actAs(null)
    await expect(runHealthCheck("database")).rejects.toBeInstanceOf(
      UnauthorizedError
    )
  })

  test("an unknown check is rejected before it runs", async () => {
    await actAs(rootOwner)
    await expect(
      runHealthCheck("everything" as unknown as "database")
    ).rejects.toThrow()
  })

  test("a root administrator sees the database and migrations", async () => {
    await actAs(rootOwner)
    const database = await runHealthCheck("database")

    expect(database.status).toBe("ok")
    expect(database.detail).toMatch(/^(\d+) of \1 migrations applied$/)
  })

  test("signing keys are described, never disclosed", async () => {
    await actAs(rootOwner)
    const keys = await runHealthCheck("signingKeys")

    expect(keys.status).not.toBe("error")
    expect(keys.detail).not.toMatch(/BEGIN|PRIVATE|"d":|"kty"/)
  })

  test("configuration names settings, never their values", async () => {
    await actAs(rootOwner)
    const configuration = JSON.stringify(await getSystemConfiguration())

    expect(configuration).not.toContain(env.auth.secret)
    expect(configuration).not.toContain(env.storage.secretAccessKey)
    expect(configuration).not.toContain(env.database.url)
    if (env.email.smtp.password) {
      expect(configuration).not.toContain(env.email.smtp.password)
    }
  })
})

async function row() {
  const [found] = await db
    .select()
    .from(systemTaskRun)
    .where(eq(systemTaskRun.task, task))
  return found
}

describe("housekeeping runs", () => {
  test("a success is upserted with what the task reported", async () => {
    const first = await recordTaskRun(task, async () => ({ deleted: 1 }))
    expect(first).toEqual({ ok: true, result: { deleted: 1 } })

    const recorded = await row()
    expect(recorded?.lastOutcome).toBe("success")
    expect(recorded?.lastError).toBeNull()
    expect(recorded?.details).toEqual({ deleted: 1 })
    expect(recorded?.lastFinishedAt?.getTime()).toBeGreaterThanOrEqual(
      recorded?.lastStartedAt.getTime() ?? Infinity
    )

    await recordTaskRun(task, async () => ({ deleted: 2 }))
    const rows = await db
      .select()
      .from(systemTaskRun)
      .where(eq(systemTaskRun.task, task))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.details).toEqual({ deleted: 2 })
    expect(rows[0]?.lastStartedAt.getTime()).toBeGreaterThanOrEqual(
      recorded?.lastStartedAt.getTime() ?? Infinity
    )
  })

  test("a failure keeps one redacted line and clears the old details", async () => {
    const outcome = await recordTaskRun(task, async () => {
      throw new Error(
        "connect failed for postgres://bedrock:hunter2@db.internal:5432/bedrock"
      )
    })
    expect(outcome.ok).toBe(false)

    const recorded = await row()
    expect(recorded?.lastOutcome).toBe("failure")
    expect(recorded?.details).toBeNull()
    expect(recorded?.lastError).toContain("postgres://***@db.internal")
    expect(recorded?.lastError).not.toContain("hunter2")
  })

  test("the Health page lists every known task, with or without a run", async () => {
    await actAs(rootOwner)
    const status = await getHousekeepingStatus()

    expect(status.tasks.map((entry) => entry.task)).toEqual([
      "organizations",
      "invitations",
      "rateLimits",
      "auditEvents",
      "usage",
    ])
    // A test task is not one of them, so it never leaks into the page.
    expect(JSON.stringify(status)).not.toContain(task)
  })
})
