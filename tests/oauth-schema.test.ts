import { describe, expect, test } from "bun:test"

import { oauthProvider } from "@better-auth/oauth-provider"
import { jwt } from "better-auth/plugins"
import { getTableColumns } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import * as schema from "@/features/shared/lib/db/schema"

// Better Auth validates its plugin schemas against the adapter at startup, so a
// missing or mistyped column takes the whole app down in `instrumentation.ts`
// before any route runs — the failure mode `account.issuer` already caused once.
// These tables were transcribed by hand, so the transcription is checked here
// rather than in production boot logs.

type FieldSpec = {
  type: string
  required?: boolean
  references?: { model: string; field: string }
}

type ModelSpec = { fields: Record<string, FieldSpec> }

const declared: Record<string, ModelSpec> = {
  ...(oauthProvider({
    loginPage: "/oauth2/login",
    consentPage: "/oauth2/consent",
  }).schema as Record<string, ModelSpec>),
  ...(jwt().schema as Record<string, ModelSpec>),
}

const tables: Record<string, PgTable> = {
  oauthClient: schema.oauthClient,
  oauthResource: schema.oauthResource,
  oauthClientResource: schema.oauthClientResource,
  oauthRefreshToken: schema.oauthRefreshToken,
  oauthAccessToken: schema.oauthAccessToken,
  oauthConsent: schema.oauthConsent,
  oauthClientAssertion: schema.oauthClientAssertion,
  jwks: schema.jwks,
}

// What each Better Auth field type must become on Postgres, per the Drizzle
// adapter's own mapping.
const columnTypeFor: Record<string, string> = {
  string: "PgText",
  "string[]": "PgArray",
  "number[]": "PgArray",
  boolean: "PgBoolean",
  number: "PgInteger",
  date: "PgTimestamp",
  json: "PgJsonb",
}

test("every model the plugins declare has a table", () => {
  expect(Object.keys(tables).toSorted()).toEqual(
    Object.keys(declared).toSorted()
  )
})

describe.each(Object.keys(declared))("%s", (model) => {
  const fields = declared[model].fields
  const columns = getTableColumns(tables[model]) as Record<string, PgColumn>

  test("has an id primary key", () => {
    expect(columns.id?.primary).toBe(true)
  })

  test.each(Object.keys(fields))("declares %s", (field) => {
    const spec = fields[field]
    const column = columns[field]

    expect(column).toBeDefined()
    expect(column.columnType).toBe(columnTypeFor[spec.type] ?? spec.type)
    // A field the plugin may omit must be nullable, or its insert fails.
    expect(column.notNull).toBe(spec.required === true)
  })

  // An extra NOT NULL column the plugin knows nothing about is never populated,
  // so every insert it makes would fail.
  test("adds no column the plugin cannot populate", () => {
    const unexpected = Object.entries(columns)
      .filter(([name, column]) => {
        if (name === "id") return false
        return column.notNull && !column.hasDefault && !(name in fields)
      })
      .map(([name]) => name)

    expect(unexpected).toEqual([])
  })
})
