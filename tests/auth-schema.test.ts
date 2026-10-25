import { describe, expect, test } from "bun:test"

import { getTableColumns } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import { auth } from "@/features/auth/lib/auth"
import * as schema from "@/features/shared/lib/db/schema"

// The models Better Auth writes with the options this instance actually runs,
// core and plugins alike. Better Auth 1.7.3 stopped writing `account.issuer`,
// which 1.7.2 had made required, so a stale NOT NULL column rejected every
// new account; this holds the Drizzle tables to what the installed version
// populates.
const { tables: models } = await auth.$context

const tables = schema as unknown as Record<string, PgTable | undefined>

// Skipped exactly as Better Auth's own startup check skips them: a table marked
// unmigrated, like Bedrock's `invitation`, is the application's to shape.
const checked = Object.keys(models).filter(
  (model) => !models[model].disableMigrations
)

test("Bedrock's own invitation table is left to Bedrock", () => {
  expect(models.invitation?.disableMigrations).toBe(true)
})

describe.each(checked)("%s", (model) => {
  const table = tables[model]
  const fields = models[model].fields
  const columns = table
    ? (getTableColumns(table) as Record<string, PgColumn>)
    : {}
  const known = new Set(
    Object.entries(fields).map(([key, field]) => field.fieldName ?? key)
  )

  test("has a table", () => {
    expect(table).toBeDefined()
  })

  test("declares every field", () => {
    expect([...known].filter((name) => !(name in columns))).toEqual([])
  })

  test("adds no column Better Auth cannot populate", () => {
    const unexpected = Object.entries(columns)
      .filter(([name, column]) => {
        if (name === "id") return false
        return column.notNull && !column.hasDefault && !known.has(name)
      })
      .map(([name]) => name)

    expect(unexpected).toEqual([])
  })
})
