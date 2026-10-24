import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnSort,
  type PaginationState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"

import { clampPageIndex } from "@/features/shared/lib/query"

// Every table here is sorted and paged by the server, but the row models still
// have to be present for the features to be enabled.
export const serverTableFeatures = tableFeatures({
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

function resolveUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function"
    ? (updater as (old: T) => T)(current)
    : updater
}

type ServerTableStateOptions<TSortPatch> = {
  sorting: SortingState
  page: number
  total: number
  pageSize: number
  toSortPatch: (sort: ColumnSort | undefined) => TSortPatch
  setQuery: (
    patch: (TSortPatch & { page: number }) | { page: number }
  ) => unknown
}

// Table options for sorting and pagination that live in the URL and are applied
// by the server. Filters stay with the caller, since only they are per-table.
export function serverTableState<TSortPatch extends object>({
  sorting,
  page,
  total,
  pageSize,
  toSortPatch,
  setQuery,
}: ServerTableStateOptions<TSortPatch>) {
  const pagination: PaginationState = {
    pageIndex: clampPageIndex(page, total, pageSize),
    pageSize,
  }

  return {
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    state: { sorting, pagination },
    onSortingChange: (updater: Updater<SortingState>) => {
      // A different order makes the current page meaningless.
      setQuery({ ...toSortPatch(resolveUpdater(updater, sorting)[0]), page: 0 })
    },
    onPaginationChange: (updater: Updater<PaginationState>) => {
      setQuery({ page: resolveUpdater(updater, pagination).pageIndex })
    },
  } as const
}
