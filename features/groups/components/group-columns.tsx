"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Ellipsis, Pencil, Tags, Trash2, UsersRound } from "lucide-react"
import type { useFormatter } from "next-intl"

import { IdentityListPopover, RoleNames } from "@/features/applications"
import { getGroupMembers } from "@/features/groups/actions/get-group-members"
import type { Group } from "@/features/groups/types"
import { DataTableSortableHeader } from "@/features/shared/components/data-table/sortable-header"
import { serverTableFeatures } from "@/features/shared/components/data-table/table-state"
import { Button } from "@/features/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import type { Translator } from "@/features/shared/lib/i18n/translator"

type GroupColumnContext = {
  t: Translator<"groups">
  format: ReturnType<typeof useFormatter>
}

type GroupActions = {
  onEdit: (group: Group) => void
  onManageMembers: (group: Group) => void
  onManageRoles: (group: Group) => void
  onRemove: (group: Group) => void
}

export function createGroupColumns(
  organizationId: string,
  { t, format }: GroupColumnContext,
  { onEdit, onManageMembers, onManageRoles, onRemove }: GroupActions
): ColumnDef<typeof serverTableFeatures, Group>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("table.columns.group")}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium">{row.original.name}</span>
          {row.original.description && (
            <p className="truncate text-sm text-muted-foreground">
              {row.original.description}
            </p>
          )}
        </div>
      ),
      enableSorting: true,
    },
    {
      id: "key",
      header: () => t("table.columns.key"),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.key}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "members",
      header: () => t("table.columns.members"),
      cell: ({ row }) => {
        const group = row.original

        return (
          <IdentityListPopover
            // A changed count means the lazily loaded list is stale.
            key={`${group.id}-${group.memberCount}`}
            title={t("lists.members.title")}
            count={group.memberCount}
            countLabel={t("lists.members.count", { count: group.memberCount })}
            preview={group.memberPreview.map((person) => ({
              id: person.id,
              name: person.name,
              secondary: person.email,
              image: person.image,
            }))}
            load={() => getGroupMembers(organizationId, group.id)}
          />
        )
      },
      enableSorting: false,
    },
    {
      id: "roles",
      header: () => t("table.columns.roles"),
      cell: ({ row }) => <RoleNames roles={row.original.roles} />,
      enableSorting: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("table.columns.created")}
        />
      ),
      cell: ({ row }) => (
        <time dateTime={row.original.createdAt}>
          {format.dateTime(new Date(row.original.createdAt), "date")}
        </time>
      ),
    },
    {
      id: "actions",
      header: () => (
        <span className="sr-only">{t("table.columns.actions")}</span>
      ),
      cell: ({ row }) => {
        const group = row.original

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("table.actions.menu", { name: group.name })}
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-auto min-w-48 whitespace-nowrap"
              >
                <DropdownMenuItem onClick={() => onEdit(group)}>
                  <Pencil />
                  {t("table.actions.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onManageMembers(group)}>
                  <UsersRound />
                  {t("table.actions.manageMembers")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onManageRoles(group)}>
                  <Tags />
                  {t("table.actions.manageRoles")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onRemove(group)}
                >
                  <Trash2 />
                  {t("table.actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
      enableSorting: false,
    },
  ]
}
