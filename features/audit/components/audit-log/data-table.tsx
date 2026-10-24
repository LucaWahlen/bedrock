"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { useFormatter, useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useMemo, useTransition } from "react"

import {
  createAuditColumns,
  type RootOrganization,
} from "@/features/audit/components/audit-log/columns"
import { AuditEventDetails } from "@/features/audit/components/audit-log/event-details"
import { auditLogSearchParams } from "@/features/audit/lib/audit-log-search-params"
import { AUDIT_OUTCOME_DISPLAY } from "@/features/audit/lib/audit-outcome-display"
import {
  AUDIT_ACTIONS,
  AUDIT_OUTCOMES,
  type AuditAction,
  type AuditEventsResult,
  type AuditOutcome,
} from "@/features/audit/types"
import {
  describeAuditActionShort,
  describeAuditDomain,
} from "@/features/audit/utils/describe-audit-action"
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

type AuditLogTableProps = {
  result: AuditEventsResult
  showOrganization: boolean
  rootOrganization: RootOrganization
}

export function AuditLogTable({
  result,
  showOrganization,
  rootOrganization,
}: AuditLogTableProps) {
  const t = useTranslations("audit")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const [isPending, startTransition] = useTransition()
  const [
    { search, action, outcome, actor, organization, direction, page },
    setQuery,
  ] = useQueryStates(auditLogSearchParams, {
    shallow: false,
    startTransition,
  })
  const sorting: SortingState = [
    { id: "createdAt", desc: direction === "desc" },
  ]
  const columns = useMemo(
    () =>
      createAuditColumns(showOrganization, rootOrganization, {
        t,
        tCommon,
        format,
      }),
    [showOrganization, rootOrganization, t, tCommon, format]
  )

  const actionOptions: FacetOption[] = AUDIT_ACTIONS.map((value) => ({
    label: describeAuditActionShort(t, value),
    value,
    group: describeAuditDomain(t, value),
    count: result.actionCounts[value] ?? 0,
  }))
  const outcomeOptions: FacetOption[] = AUDIT_OUTCOMES.map((value) => ({
    value,
    label: t(`outcomes.${value}`),
    icon: AUDIT_OUTCOME_DISPLAY[value].icon,
    count: result.outcomeCounts[value],
  }))
  const actorOptions: FacetOption[] = result.actorFacets.map((facet) => ({
    ...facet,
    avatar: { seed: facet.value, logo: facet.image },
  }))
  const organizationOptions: FacetOption[] = result.organizationFacets.map(
    (facet) => ({
      ...facet,
      avatar: { seed: facet.value, logo: facet.image },
    })
  )

  const table = useTable({
    features: serverTableFeatures,
    data: result.events,
    columns,
    getRowId: (event) => event.id,
    ...serverTableState({
      sorting,
      page,
      total: result.total,
      pageSize: result.pageSize,
      toSortPatch: (next): { direction: SortDirection } => ({
        direction: next?.desc ? "desc" : "asc",
      }),
      setQuery,
    }),
  })

  const hasFilters =
    search.length > 0 ||
    action.length > 0 ||
    outcome.length > 0 ||
    actor.length > 0 ||
    organization.length > 0

  return (
    <DataTableLayout
      pending={isPending}
      toolbar={
        <DataTableToolbar
          entityLabel={t("table.entity")}
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
                    action: [],
                    outcome: [],
                    actor: [],
                    organization: [],
                    page: 0,
                  })
              : undefined
          }
        >
          <DataTableFacetedFilter
            title={t("columns.event")}
            options={actionOptions}
            selected={action}
            onChange={(values) =>
              setQuery({ action: values as AuditAction[], page: 0 })
            }
          />
          <DataTableFacetedFilter
            title={t("columns.outcome")}
            options={outcomeOptions}
            selected={outcome}
            onChange={(values) =>
              setQuery({ outcome: values as AuditOutcome[], page: 0 })
            }
          />
          {showOrganization && (
            <DataTableFacetedFilter
              title={t("columns.organization")}
              options={organizationOptions}
              selected={organization}
              onChange={(values) => setQuery({ organization: values, page: 0 })}
            />
          )}
          <DataTableFacetedFilter
            title={t("columns.actor")}
            options={actorOptions}
            selected={actor}
            onChange={(values) => setQuery({ actor: values, page: 0 })}
          />
        </DataTableToolbar>
      }
      pagination={
        <DataTablePagination
          table={table}
          singularLabel={t("table.singular")}
          pluralLabel={t("table.plural")}
        />
      }
    >
      <DataTable
        table={table}
        emptyMessage={t("table.empty")}
        ariaLabel={t("table.label")}
        shrinkColumnIds={["actions"]}
        renderDetail={(event) => <AuditEventDetails event={event} />}
      />
    </DataTableLayout>
  )
}
