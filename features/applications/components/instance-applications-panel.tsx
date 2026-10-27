"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useState, useTransition } from "react"

import { createInstanceApplicationColumns } from "@/features/applications/components/application-columns"
import {
  ConnectionDialog,
  type ApplicationConnection,
} from "@/features/applications/components/connection-dialog"
import { applicationsSearchParams } from "@/features/applications/lib/applications-search-params"
import {
  APPLICATION_TYPES,
  type ApplicationSort,
  type ApplicationType,
  type InstanceApplicationsResult,
  type OidcConfiguration,
} from "@/features/applications/types"
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

type InstanceApplicationsPanelProps = {
  result: InstanceApplicationsResult
  configuration: OidcConfiguration
}

// Read-only on purpose. Root administration can see every application on the
// instance, but an application belongs to the organization that registered it,
// and running the instance grants no authority inside one.
export function InstanceApplicationsPanel({
  result,
  configuration,
}: InstanceApplicationsPanelProps) {
  const t = useTranslations("applications")
  const tCommon = useTranslations("common")
  const [isPending, startTransition] = useTransition()
  const [{ search, type, sort, direction, page }, setQuery] = useQueryStates(
    applicationsSearchParams,
    { shallow: false, startTransition }
  )
  const [connection, setConnection] = useState<ApplicationConnection | null>(
    null
  )
  const sorting: SortingState = [{ id: sort, desc: direction === "desc" }]
  const typeOptions: FacetOption[] = APPLICATION_TYPES.map((value) => ({
    value,
    label: t(`types.${value}`),
    count: result.typeCounts[value],
  }))

  const columns = createInstanceApplicationColumns(
    { t, tCommon },
    (application) =>
      setConnection({
        clientId: application.clientId,
        name: application.name,
        isConfidential: application.isConfidential,
        tokenEndpointAuthMethod: application.tokenEndpointAuthMethod,
      })
  )

  const table = useTable({
    features: serverTableFeatures,
    data: result.applications,
    columns,
    getRowId: (application) => application.clientId,
    ...serverTableState({
      sorting,
      page,
      total: result.total,
      pageSize: result.pageSize,
      toSortPatch: (
        next
      ): { sort: ApplicationSort; direction: SortDirection } => ({
        sort: next?.id === "createdAt" ? "createdAt" : "name",
        direction: next?.desc ? "desc" : "asc",
      }),
      setQuery,
    }),
  })

  const hasFilters = search.length > 0 || type.length > 0

  return (
    <>
      <DataTableLayout
        pending={isPending}
        toolbar={
          <DataTableToolbar
            entityLabel={t("applicationsTable.entity")}
            search={search}
            onSearchChange={(nextSearch) =>
              setQuery(
                { search: nextSearch, page: 0 },
                { limitUrlUpdates: nextSearch ? debounce(300) : undefined }
              )
            }
            onClearFilters={
              hasFilters
                ? () => setQuery({ search: "", type: [], page: 0 })
                : undefined
            }
          >
            <DataTableFacetedFilter
              title={t("applicationsTable.typeFilter")}
              options={typeOptions}
              selected={type}
              onChange={(values) =>
                setQuery({ type: values as ApplicationType[], page: 0 })
              }
            />
          </DataTableToolbar>
        }
        pagination={
          <DataTablePagination
            table={table}
            singularLabel={t("applicationsTable.singular")}
            pluralLabel={t("applicationsTable.plural")}
          />
        }
      >
        <DataTable
          table={table}
          emptyMessage={t("applicationsTable.empty")}
          ariaLabel={t("applicationsTable.instanceAriaLabel")}
          shrinkColumnIds={["actions"]}
        />
      </DataTableLayout>

      <ConnectionDialog
        connection={connection}
        configuration={configuration}
        onOpenChange={(open: boolean) => {
          if (!open) setConnection(null)
        }}
      />
    </>
  )
}
