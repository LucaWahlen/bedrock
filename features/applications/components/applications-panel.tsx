"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteApplication } from "@/features/applications/actions/delete-application"
import { rotateApplicationSecret } from "@/features/applications/actions/rotate-application-secret"
import { createApplicationColumns } from "@/features/applications/components/application-columns"
import { ApplicationDialog } from "@/features/applications/components/application-dialog"
import {
  ConnectionDialog,
  type ApplicationConnection,
} from "@/features/applications/components/connection-dialog"
import { applicationsSearchParams } from "@/features/applications/lib/applications-search-params"
import {
  APPLICATION_TYPES,
  type Application,
  type ApplicationSort,
  type ApplicationsResult,
  type ApplicationType,
  type OidcConfiguration,
} from "@/features/applications/types"
import { OrganizationActionDialog } from "@/features/organizations"
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
import { Button } from "@/features/shared/components/ui/button"
import type { SortDirection } from "@/features/shared/lib/query"

type ApplicationsPanelProps = {
  organizationId: string
  result: ApplicationsResult
  configuration: OidcConfiguration
}

export function ApplicationsPanel({
  organizationId,
  result,
  configuration,
}: ApplicationsPanelProps) {
  const t = useTranslations("applications")
  const tCommon = useTranslations("common")
  const [isNavigating, startNavigation] = useTransition()
  const [isPending, startTransition] = useTransition()
  const [{ search, type, sort, direction, page }, setQuery] = useQueryStates(
    applicationsSearchParams,
    { shallow: false, startTransition: startNavigation }
  )
  const [dialog, setDialog] = useState<{
    open: boolean
    application?: Application
  }>({ open: false })
  const [connection, setConnection] = useState<ApplicationConnection | null>(
    null
  )
  const [removal, setRemoval] = useState<Application | null>(null)
  const sorting: SortingState = [{ id: sort, desc: direction === "desc" }]
  const typeOptions: FacetOption[] = APPLICATION_TYPES.map((value) => ({
    value,
    label: t(`types.${value}`),
    count: result.typeCounts[value],
  }))

  function rotate(application: Application) {
    startTransition(async () => {
      const rotated = await rotateApplicationSecret(
        organizationId,
        application.clientId
      )

      if (!rotated.success) {
        toast.error(rotated.error)
        return
      }

      setConnection({
        clientId: rotated.clientId,
        name: application.name,
        isConfidential: true,
        tokenEndpointAuthMethod: application.tokenEndpointAuthMethod,
        clientSecret: rotated.clientSecret ?? undefined,
      })
    })
  }

  function confirmRemoval() {
    if (!removal) return

    startTransition(async () => {
      const deleted = await deleteApplication(organizationId, removal.clientId)

      if (!deleted.success) {
        toast.error(deleted.error)
        return
      }

      const { name } = removal
      setRemoval(null)
      toast.success(t("applicationsTable.deleted", { name }))
    })
  }

  const columns = createApplicationColumns(
    { t, tCommon },
    {
      onConnect: (application) =>
        setConnection({
          clientId: application.clientId,
          name: application.name,
          isConfidential: application.isConfidential,
          tokenEndpointAuthMethod: application.tokenEndpointAuthMethod,
        }),
      onEdit: (application) => setDialog({ open: true, application }),
      onRotate: rotate,
      onRemove: setRemoval,
    }
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
        pending={isNavigating}
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
            action={
              <Button onClick={() => setDialog({ open: true })}>
                <Plus />
                {t("applicationsTable.newApplication")}
              </Button>
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
          ariaLabel={t("applicationsTable.ariaLabel")}
          shrinkColumnIds={["actions"]}
        />
      </DataTableLayout>

      <ApplicationDialog
        key={dialog.application?.clientId ?? "new-application"}
        organizationId={organizationId}
        application={dialog.application}
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open })}
        onCreated={({
          clientId,
          clientSecret,
          name,
          tokenEndpointAuthMethod,
        }) =>
          setConnection({
            clientId,
            name,
            isConfidential: clientSecret !== null,
            tokenEndpointAuthMethod,
            clientSecret: clientSecret ?? undefined,
          })
        }
      />

      <ConnectionDialog
        connection={connection}
        configuration={configuration}
        onOpenChange={(open: boolean) => {
          if (!open) setConnection(null)
        }}
      />

      <OrganizationActionDialog
        open={removal !== null}
        onOpenChange={(open) => {
          if (!open) setRemoval(null)
        }}
        title={t("applicationsTable.deleteDialog.title")}
        description={
          removal
            ? t("applicationsTable.deleteDialog.description", {
                name: removal.name,
              })
            : undefined
        }
        confirmLabel={tCommon("actions.delete")}
        variant="destructive"
        confirmSlug={removal?.name ?? null}
        pending={isPending}
        onConfirm={confirmRemoval}
      />
    </>
  )
}
