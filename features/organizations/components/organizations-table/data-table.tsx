"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { useFormatter, useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useMemo, useTransition } from "react"

import { createOrganizationColumns } from "@/features/organizations/components/organizations-table/columns"
import { ORGANIZATION_STATUS_DISPLAY } from "@/features/organizations/lib/organization-status-display"
import { organizationsSearchParams } from "@/features/organizations/lib/organizations-search-params"
import {
  ORGANIZATION_STATUSES,
  type OrganizationsResult,
  type OrganizationSort,
  type OrganizationStatus,
} from "@/features/organizations/types"
import { DataTable } from "@/features/shared/components/data-table/data-table"
import {
  DataTableFacetedFilter,
  type FacetOption,
} from "@/features/shared/components/data-table/faceted-filter"
import { DataTableLayout } from "@/features/shared/components/data-table/layout"
import { DataTablePagination } from "@/features/shared/components/data-table/pagination"
import {
  serverTableFeatures,
  serverTableState,
} from "@/features/shared/components/data-table/table-state"
import { DataTableToolbar } from "@/features/shared/components/data-table/toolbar"
import type { SortDirection } from "@/features/shared/lib/query"

type OrganizationsTableProps = {
  result: OrganizationsResult
}

export function OrganizationsTable({ result }: OrganizationsTableProps) {
  const t = useTranslations("organizations")
  const format = useFormatter()
  const columns = useMemo(
    () => createOrganizationColumns(t, format),
    [t, format]
  )
  const [isPending, startTransition] = useTransition()
  const [{ search, status, sort, direction, page }, setQuery] = useQueryStates(
    organizationsSearchParams,
    { shallow: false, startTransition }
  )
  const sorting: SortingState = [{ id: sort, desc: direction === "desc" }]
  const statusOptions: FacetOption[] = ORGANIZATION_STATUSES.map((value) => ({
    value,
    label: t(`organizationStatus.${value}`),
    icon: ORGANIZATION_STATUS_DISPLAY[value].icon,
    count: result.statusCounts[value],
  }))

  const table = useTable({
    features: serverTableFeatures,
    data: result.organizations,
    columns,
    ...serverTableState({
      sorting,
      page,
      total: result.total,
      pageSize: result.pageSize,
      toSortPatch: (
        next
      ): { sort: OrganizationSort; direction: SortDirection } => ({
        sort: next?.id === "createdAt" ? "createdAt" : "name",
        direction: next?.desc ? "desc" : "asc",
      }),
      setQuery,
    }),
  })

  const hasFilters = search.length > 0 || status.length > 0

  return (
    <DataTableLayout
      pending={isPending}
      toolbar={
        <DataTableToolbar
          entityLabel={t("organizationsTable.table.searchEntity")}
          search={search}
          onSearchChange={(nextSearch) =>
            setQuery(
              { search: nextSearch, page: 0 },
              // Clearing the input should hit the server right away.
              { limitUrlUpdates: nextSearch ? debounce(300) : undefined }
            )
          }
          onClearFilters={
            hasFilters
              ? () => setQuery({ search: "", status: [], page: 0 })
              : undefined
          }
        >
          <DataTableFacetedFilter
            title={t("organizationsTable.filters.status")}
            options={statusOptions}
            selected={status}
            onChange={(values) =>
              setQuery({ status: values as OrganizationStatus[], page: 0 })
            }
          />
        </DataTableToolbar>
      }
      pagination={
        <DataTablePagination
          table={table}
          singularLabel={t("organizationsTable.table.unitOne")}
          pluralLabel={t("organizationsTable.table.unitOther")}
        />
      }
    >
      <DataTable
        table={table}
        emptyMessage={t("organizationsTable.table.empty")}
        ariaLabel={t("organizationsTable.table.label")}
        shrinkColumnIds={["actions"]}
      />
    </DataTableLayout>
  )
}
