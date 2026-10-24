// Normalization for list queries that read their state from the URL. The
// client and the server both apply these, so a hand-edited URL resolves to the
// same query on either side.

export const SORT_DIRECTIONS = ["asc", "desc"] as const

export type SortDirection = (typeof SORT_DIRECTIONS)[number]

const SEARCH_MAX_LENGTH = 100

export function normalizeSearch(search: string | undefined) {
  return search?.trim().slice(0, SEARCH_MAX_LENGTH) || undefined
}

export function normalizeLiterals<TLiteral extends string>(
  values: TLiteral[] | undefined,
  allowed: readonly TLiteral[]
) {
  return Array.from(new Set(values ?? [])).filter((value) =>
    allowed.includes(value)
  )
}

export function normalizeIds(ids: string[] | undefined, limit: number) {
  return Array.from(new Set(ids ?? [])).slice(0, limit)
}

export function normalizeLiteral<TLiteral extends string>(
  value: TLiteral | undefined,
  allowed: readonly TLiteral[],
  fallback: NoInfer<TLiteral>
) {
  return value && allowed.includes(value) ? value : fallback
}

export function normalizePageSize(
  pageSize: number | undefined,
  defaultPageSize: number,
  maxPageSize = 100
) {
  return Math.min(
    maxPageSize,
    Math.max(1, Math.floor(pageSize ?? defaultPageSize))
  )
}

export function lastPageIndex(total: number, pageSize: number) {
  return Math.max(0, Math.ceil(total / pageSize) - 1)
}

export function clampPageIndex(
  pageIndex: number,
  total: number,
  pageSize: number
) {
  return Math.min(Math.max(pageIndex, 0), lastPageIndex(total, pageSize))
}

// One-based, as the query and the URL count pages.
export function clampPage(page: number, total: number, pageSize: number) {
  return clampPageIndex(Math.floor(page) - 1, total, pageSize) + 1
}
