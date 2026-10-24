"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import type { ApplicationRoleOption } from "@/features/applications"
import { deleteGroup } from "@/features/groups/actions/delete-group"
import { createGroupColumns } from "@/features/groups/components/group-columns"
import { GroupDialog } from "@/features/groups/components/group-dialog"
import { GroupMembersDialog } from "@/features/groups/components/group-members-dialog"
import { GroupRolesDialog } from "@/features/groups/components/group-roles-dialog"
import { groupsSearchParams } from "@/features/groups/lib/groups-search-params"
import type { Group, GroupSort, GroupsResult } from "@/features/groups/types"
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

type GroupsPanelProps = {
  organizationId: string
  roles: ApplicationRoleOption[]
  result: GroupsResult
}

export function GroupsPanel({
  organizationId,
  roles,
  result,
}: GroupsPanelProps) {
  const t = useTranslations("groups")
  const format = useFormatter()
  const [isNavigating, startNavigation] = useTransition()
  const [isPending, startTransition] = useTransition()
  const [{ search, role, sort, direction, page }, setQuery] = useQueryStates(
    groupsSearchParams,
    { shallow: false, startTransition: startNavigation }
  )
  const [dialog, setDialog] = useState<{ open: boolean; group?: Group }>({
    open: false,
  })
  const [removal, setRemoval] = useState<Group | null>(null)
  // The group is kept after a dialog closes so it does not empty while closing.
  const [members, setMembers] = useState<{ group: Group; open: boolean }>()
  const [grants, setGrants] = useState<{ group: Group; open: boolean }>()
  const sorting: SortingState = [{ id: sort, desc: direction === "desc" }]
  const roleOptions: FacetOption[] = roles.map((option) => ({
    value: option.id,
    label: option.name,
    count: result.roleCounts[option.id] ?? 0,
  }))

  function confirmRemoval() {
    if (!removal) return

    startTransition(async () => {
      const deleted = await deleteGroup(organizationId, removal.id)

      if (!deleted.success) {
        toast.error(deleted.error)
        return
      }

      const { name } = removal
      setRemoval(null)
      toast.success(`${name} was deleted`)
    })
  }

  const columns = createGroupColumns(
    organizationId,
    { t, format },
    {
      onEdit: (group) => setDialog({ open: true, group }),
      onManageMembers: (group) => setMembers({ group, open: true }),
      onManageRoles: (group) => setGrants({ group, open: true }),
      onRemove: setRemoval,
    }
  )

  const table = useTable({
    features: serverTableFeatures,
    data: result.groups,
    columns,
    getRowId: (group) => group.id,
    ...serverTableState({
      sorting,
      page,
      total: result.total,
      pageSize: result.pageSize,
      toSortPatch: (next): { sort: GroupSort; direction: SortDirection } => ({
        sort: next?.id === "createdAt" ? "createdAt" : "name",
        direction: next?.desc ? "desc" : "asc",
      }),
      setQuery,
    }),
  })

  const hasFilters = search.length > 0 || role.length > 0

  return (
    <>
      <DataTableLayout
        pending={isNavigating}
        toolbar={
          <DataTableToolbar
            entityLabel="groups"
            search={search}
            onSearchChange={(nextSearch) =>
              setQuery(
                { search: nextSearch, page: 0 },
                { limitUrlUpdates: nextSearch ? debounce(300) : undefined }
              )
            }
            onClearFilters={
              hasFilters
                ? () => setQuery({ search: "", role: [], page: 0 })
                : undefined
            }
            action={
              <Button onClick={() => setDialog({ open: true })}>
                <Plus />
                New group
              </Button>
            }
          >
            {roles.length > 0 && (
              <DataTableFacetedFilter
                title="Role"
                options={roleOptions}
                selected={role}
                onChange={(values) => setQuery({ role: values, page: 0 })}
              />
            )}
          </DataTableToolbar>
        }
        pagination={
          <DataTablePagination
            table={table}
            singularLabel="group"
            pluralLabel="groups"
          />
        }
      >
        <DataTable
          table={table}
          emptyMessage="No groups found."
          ariaLabel="Groups"
          shrinkColumnIds={["actions"]}
        />
      </DataTableLayout>

      <GroupDialog
        key={dialog.group?.id ?? "new-group"}
        organizationId={organizationId}
        roles={roles}
        group={dialog.group}
        open={dialog.open}
        onOpenChange={(open) => setDialog({ ...dialog, open })}
      />

      {members && (
        <GroupMembersDialog
          key={members.group.id}
          organizationId={organizationId}
          group={members.group}
          open={members.open}
          onOpenChange={(open) => setMembers({ ...members, open })}
        />
      )}

      {grants && (
        <GroupRolesDialog
          key={grants.group.id}
          organizationId={organizationId}
          group={grants.group}
          roles={roles}
          open={grants.open}
          onOpenChange={(open) => setGrants({ ...grants, open })}
        />
      )}

      <OrganizationActionDialog
        open={removal !== null}
        onOpenChange={(open) => {
          if (!open) setRemoval(null)
        }}
        title="Delete group?"
        description={
          removal
            ? `Everyone in ${removal.name} loses the roles it grants, and applications stop receiving ${removal.key}.`
            : undefined
        }
        confirmLabel="Delete group"
        variant="destructive"
        pending={isPending}
        onConfirm={confirmRemoval}
      />
    </>
  )
}
