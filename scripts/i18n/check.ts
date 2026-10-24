/// <reference types="bun" />
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import {
  parse,
  TYPE,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser"

import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
} from "@/features/shared/lib/i18n/config"

// `bun run i18n:check`: every language holds exactly the keys English holds,
// none of them empty, each one valid ICU using the same arguments and tags.
// English is the source of truth; see `features/shared/lib/i18n/messages.ts`.

// Namespace name to its parsed file, or `undefined` when the file is missing.
export type Catalogs = Record<Locale, Record<string, unknown>>

const MESSAGES_DIRECTORY = path.join(import.meta.dir, "..", "..", "messages")

function flatten(
  value: unknown,
  prefix = "",
  into = new Map<string, unknown>()
) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, into)
    }
  } else {
    into.set(prefix, value)
  }

  return into
}

// The arguments and tags a message expects, e.g. `{count}` and `<link>`.
function placeholdersOf(
  elements: MessageFormatElement[],
  into = new Set<string>()
) {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        into.add(`{${element.value}}`)
        break
      case TYPE.select:
      case TYPE.plural:
        into.add(`{${element.value}}`)
        for (const option of Object.values(element.options)) {
          placeholdersOf(option.value, into)
        }
        break
      case TYPE.tag:
        into.add(`<${element.value}>`)
        placeholdersOf(element.children, into)
        break
    }
  }

  return into
}

function describe(placeholders: Set<string>) {
  return placeholders.size > 0
    ? [...placeholders].toSorted().join(", ")
    : "none"
}

function checkMessage(
  file: string,
  key: string,
  value: unknown
): { problem: string } | { placeholders: Set<string> } {
  if (typeof value !== "string") {
    return { problem: `${file}: "${key}" must be a string or an object` }
  }
  if (value.trim() === "") return { problem: `${file}: "${key}" is empty` }

  try {
    return { placeholders: placeholdersOf(parse(value)) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { problem: `${file}: "${key}" is not valid ICU (${reason})` }
  }
}

export function checkCatalogs(catalogs: Catalogs): string[] {
  const problems: string[] = []
  const namespaces = new Set(
    LOCALES.flatMap((locale) => Object.keys(catalogs[locale]))
  )

  for (const namespace of [...namespaces].toSorted()) {
    const sourceFile = `${DEFAULT_LOCALE}/${namespace}.json`
    const source = catalogs[DEFAULT_LOCALE][namespace]
    if (source === undefined) {
      problems.push(`${sourceFile}: missing`)
      continue
    }

    const sourceMessages = flatten(source)
    const sourcePlaceholders = new Map<string, Set<string>>()
    for (const [key, value] of sourceMessages) {
      const result = checkMessage(sourceFile, key, value)
      if ("problem" in result) problems.push(result.problem)
      else sourcePlaceholders.set(key, result.placeholders)
    }

    for (const locale of LOCALES) {
      if (locale === DEFAULT_LOCALE) continue

      const file = `${locale}/${namespace}.json`
      const target = catalogs[locale][namespace]
      if (target === undefined) {
        problems.push(`${file}: missing`)
        continue
      }

      const targetMessages = flatten(target)
      for (const key of sourceMessages.keys()) {
        if (!targetMessages.has(key)) {
          problems.push(`${file}: missing "${key}"`)
        }
      }

      for (const [key, value] of targetMessages) {
        if (!sourceMessages.has(key)) {
          problems.push(`${file}: "${key}" is not in ${sourceFile}`)
          continue
        }

        const result = checkMessage(file, key, value)
        if ("problem" in result) {
          problems.push(result.problem)
          continue
        }

        const expected = sourcePlaceholders.get(key)
        if (expected && describe(expected) !== describe(result.placeholders)) {
          problems.push(
            `${file}: "${key}" uses ${describe(result.placeholders)}, but ${sourceFile} uses ${describe(expected)}`
          )
        }
      }
    }
  }

  return problems
}

export async function loadCatalogs(
  directory = MESSAGES_DIRECTORY
): Promise<{ catalogs: Catalogs; problems: string[] }> {
  const problems: string[] = []
  const catalogs = Object.fromEntries(
    LOCALES.map((locale) => [locale, {}])
  ) as Catalogs

  for (const locale of LOCALES) {
    const files = await readdir(path.join(directory, locale)).catch(() => [])
    for (const file of files) {
      if (!file.endsWith(".json")) continue

      const namespace = file.slice(0, -".json".length)
      const text = await readFile(path.join(directory, locale, file), "utf8")
      try {
        catalogs[locale][namespace] = JSON.parse(text)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        problems.push(`${locale}/${file}: not valid JSON (${reason})`)
        catalogs[locale][namespace] = {}
      }
    }
  }

  return { catalogs, problems }
}

if (import.meta.main) {
  const { catalogs, problems } = await loadCatalogs()
  problems.push(...checkCatalogs(catalogs))

  if (problems.length > 0) {
    console.error(`i18n: ${problems.length} problem(s)`)
    for (const problem of problems) console.error(`  ${problem}`)
    process.exit(1)
  }

  console.log(`i18n: ${LOCALES.join(", ")} hold the same messages`)
}
