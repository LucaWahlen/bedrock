"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteApplicationRole } from "@/features/applications/actions/delete-application-role"
import { createRoleColumns } from "@/features/applications/components/role-columns"
import { RoleDialog } from "@/features/applications/components/role-dialog"
import { RoleGroupsDialog } from "@/features/applications/components/role-groups-dialog"
import { RoleMembersDialog } from "@/features/applications/components/role-members-dialog"
import { applicationRolesSearchParams } from "@/features/applications/lib/applications-search-params"
import type {
  ApplicationRole,
  ApplicationRoleSort,
  ApplicationRolesResult,
  ApplicationSummary,
  RoleGroupOption,
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

type RolesPanelProps = {
  organizationId: string
  organizationSlug: string
  applications: ApplicationSummary[]
  groups: RoleGroupOption[]
  result: ApplicationRolesResult
}

export function RolesPanel({
  organizationId,
  organizationSlug,
  applications,
  groups,
  result,
}: RolesPanelProps) {
  const t = useTranslations("applications")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const [isNavigating, startNavigation] = useTransition()
  const [isPending, startTransition] = useTransition()
  const [{ search, application, sort, direction, page }, setQuery] =
    useQueryStates(applicationRolesSearchParams, {
      shallow: false,
      startTransition: startNavigation,
    })
  const [dialog, setDialog] = useState<{
    open: boolean
    role?: ApplicationRole
  }>({ open: false })
  const [removal, setRemoval] = useState<ApplicationRole | null>(null)
  // The role is kept after the dialog closes so it does not empty while closing.
  const [holders, setHolders] = useState<{
    role: ApplicationRole
    open: boolean
  }>()
  const [grants, setGrants] = useState<{
    role: ApplicationRole
    open: boolean
  }>()
  const sorting: SortingState = [{ id: sort, desc: direction === "desc" }]
  const applicationOptions: FacetOption[] = applications.map((option) => ({
    value: option.clientId,
    label: option.name,
    avatar: { seed: option.clientId, logo: option.icon },
    count: result.applicationCounts[option.clientId] ?? 0,
  }))

  function confirmRemoval() {
    if (!removal) return

    startTransition(async () => {
      const deleted = await deleteApplicationRole(organizationId, removal.id)

      if (!deleted.success) {
        toast.error(deleted.error)
        return
      }

      const { name } = removal
      setRemoval(null)
      toast.success(t("rolesTable.deleted", { name }))
    })
  }

  const columns = createRoleColumns(
    organizationId,
    { t, format },
    {
      onEdit: (role) => setDialog({ open: true, role }),
      onManageMembers: (role) => setHolders({ role, open: true }),
      onManageGroups: (role) => setGrants({ role, open: true }),
      onRemove: setRemoval,
    }
  )

  const table = useTable({
    features: serverTableFeatures,
    data: result.roles,
    columns,
    getRowId: (role) => role.id,
    ...serverTableState({
      sorting,
      page,
      total: result.total,
      pageSize: result.pageSize,
      toSortPatch: (
        next
      ): { sort: ApplicationRoleSort; direction: SortDirection } => ({
        sort: next?.id === "createdAt" ? "createdAt" : "name",
        direction: next?.desc ? "desc" : "asc",
      }),
      setQuery,
    }),
  })

  const hasFilters = search.length > 0 || application.length > 0

  return (
    <>
      <DataTableLayout
        pending={isNavigating}
        toolbar={
          <DataTableToolbar
            entityLabel={t("rolesTable.entity")}
            search={search}
            onSearchChange={(nextSearch) =>
              setQuery(
                { search: nextSearch, page: 0 },
                { limitUrlUpdates: nextSearch ? debounce(300) : undefined }
              )
            }
            onClearFilters={
              hasFilters
                ? () => setQuery({ search: "", application: [], page: 0 })
                : undefined
            }
            action={
              <Button
                disabled={applications.length === 0}
                title={
                  applications.length === 0
                    ? t("rolesTable.registerFirst")
                    : undefined
                }
                onClick={() => setDialog({ open: true })}
              >
                <Plus />
                {t("rolesTable.newRole")}
              </Button>
            }
          >
            {applications.length > 0 && (
              <DataTableFacetedFilter
                title={t("rolesTable.applicationFilter")}
                options={applicationOptions}
                selected={application}
                onChange={(values) =>
                  setQuery({ application: values, page: 0 })
                }
              />
            )}
          </DataTableToolbar>
        }
        pagination={
          <DataTablePagination
            table={table}
            singularLabel={t("rolesTable.singular")}
            pluralLabel={t("rolesTable.plural")}
          />
        }
      >
        <DataTable
          table={table}
          emptyMessage={
            applications.length === 0
              ? t("rolesTable.registerFirst")
              : t("rolesTable.empty")
          }
          ariaLabel={t("rolesTable.ariaLabel")}
          shrinkColumnIds={["actions"]}
        />
      </DataTableLayout>

      <RoleDialog
        key={dialog.role?.id ?? "new-role"}
        organizationId={organizationId}
        applications={applications}
        role={dialog.role}
        open={dialog.open}
        onOpenChange={(open) => setDialog({ open })}
      />

      {holders && (
        <RoleMembersDialog
          key={holders.role.id}
          organizationId={organizationId}
          organizationSlug={organizationSlug}
          role={holders.role}
          open={holders.open}
          onOpenChange={(open) => setHolders({ ...holders, open })}
        />
      )}

      {grants && (
        <RoleGroupsDialog
          key={grants.role.id}
          organizationId={organizationId}
          role={grants.role}
          groups={groups}
          open={grants.open}
          onOpenChange={(open) => setGrants({ ...grants, open })}
        />
      )}

      <OrganizationActionDialog
        open={removal !== null}
        onOpenChange={(open) => {
          if (!open) setRemoval(null)
        }}
        title={t("rolesTable.deleteDialog.title")}
        description={
          removal
            ? t("rolesTable.deleteDialog.description", { name: removal.name })
            : undefined
        }
        confirmLabel={tCommon("actions.delete")}
        variant="destructive"
        pending={isPending}
        onConfirm={confirmRemoval}
      />
    </>
  )
}
