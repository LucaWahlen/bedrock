"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { Ban, UserRoundCheck } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useMemo, useTransition } from "react"

import { createDirectoryColumns } from "@/features/organizations/components/people-table/directory-columns"
import { directorySearchParams } from "@/features/organizations/lib/people-search-params"
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  type DirectoryResult,
  type PeopleSort,
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

type DirectoryTableProps = {
  result: DirectoryResult
}

export function DirectoryTable({ result }: DirectoryTableProps) {
  const t = useTranslations("organizations")
  const format = useFormatter()
  const columns = useMemo(() => createDirectoryColumns(t, format), [t, format])
  const [isPending, startTransition] = useTransition()
  const [{ search, organization, account, sort, direction, page }, setQuery] =
    useQueryStates(directorySearchParams, { shallow: false, startTransition })
  const accountOptions: FacetOption[] = ACCOUNT_STATUSES.map((value) => ({
    value,
    label: t(`accountStatus.${value}`),
    icon: value === "disabled" ? Ban : UserRoundCheck,
    count: result.statusCounts[value],
  }))
  const sorting: SortingState = [{ id: sort, desc: direction === "desc" }]
  const organizationOptions: FacetOption[] = result.organizationFacets.map(
    (facet) => ({
      ...facet,
      avatar: { seed: facet.value, logo: facet.image },
    })
  )

  const table = useTable({
    features: serverTableFeatures,
    data: result.people,
    columns,
    getRowId: (person) => person.id,
    ...serverTableState({
      sorting,
      page,
      total: result.total,
      pageSize: result.pageSize,
      toSortPatch: (next): { sort: PeopleSort; direction: SortDirection } => ({
        sort:
          next?.id === "createdAt" || next?.id === "lastActiveAt"
            ? next.id
            : "name",
        direction: next?.desc ? "desc" : "asc",
      }),
      setQuery,
    }),
  })

  const hasFilters =
    search.length > 0 || organization.length > 0 || account.length > 0

  return (
    <DataTableLayout
      pending={isPending}
      toolbar={
        <DataTableToolbar
          entityLabel={t("directory.table.searchEntity")}
          search={search}
          onSearchChange={(nextSearch) =>
            setQuery(
              { search: nextSearch, page: 0 },
              { limitUrlUpdates: nextSearch ? debounce(300) : undefined }
            )
          }
          onClearFilters={
            hasFilters
              ? () =>
                  setQuery({
                    search: "",
                    organization: [],
                    account: [],
                    page: 0,
                  })
              : undefined
          }
        >
          <DataTableFacetedFilter
            title={t("directory.filters.organization")}
            options={organizationOptions}
            selected={organization}
            onChange={(values) => setQuery({ organization: values, page: 0 })}
          />
          <DataTableFacetedFilter
            title={t("directory.filters.account")}
            options={accountOptions}
            selected={account}
            onChange={(values) =>
              setQuery({ account: values as AccountStatus[], page: 0 })
            }
          />
        </DataTableToolbar>
      }
      pagination={
        <DataTablePagination
          table={table}
          singularLabel={t("directory.table.unitOne")}
          pluralLabel={t("directory.table.unitOther")}
        />
      }
    >
      <DataTable
        table={table}
        emptyMessage={t("directory.table.empty")}
        ariaLabel={t("directory.table.label")}
        shrinkColumnIds={["actions"]}
      />
    </DataTableLayout>
  )
}
