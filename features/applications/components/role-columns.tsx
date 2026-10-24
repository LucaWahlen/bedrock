"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Ellipsis, Network, Pencil, Trash2, UsersRound } from "lucide-react"
import type { useFormatter } from "next-intl"

import { getRoleMembers } from "@/features/applications/actions/get-role-members"
import { CreatedCell } from "@/features/applications/components/application-cells"
import { IdentityListPopover } from "@/features/applications/components/identity-list-popover"
import type { ApplicationRole } from "@/features/applications/types"
import { describeRoleSource } from "@/features/applications/utils/role-source"
import { DataTableSortableHeader } from "@/features/shared/components/data-table/sortable-header"
import { serverTableFeatures } from "@/features/shared/components/data-table/table-state"
import { KeyedBadges } from "@/features/shared/components/keyed-badges"
import { Button } from "@/features/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import type { Translator } from "@/features/shared/lib/i18n/translator"

type RoleColumnContext = {
  t: Translator<"applications">
  format: ReturnType<typeof useFormatter>
}

type RoleActions = {
  onEdit: (role: ApplicationRole) => void
  onManageMembers: (role: ApplicationRole) => void
  onManageGroups: (role: ApplicationRole) => void
  onRemove: (role: ApplicationRole) => void
}

// Everyone holding the role, and how many of them were given it directly, which
// are the only ones its members dialog can take it from.
function describeMemberCount(
  t: Translator<"applications">,
  { memberCount, directMemberCount }: ApplicationRole
) {
  const total = t("lists.members.count", { count: memberCount })
  const share = describeDirectShare(t, { memberCount, directMemberCount })

  return share ? t("lists.members.breakdown", { total, share }) : total
}

// Nothing when everyone was given the role directly, which is the plain case.
function describeDirectShare(
  t: Translator<"applications">,
  {
    memberCount,
    directMemberCount,
  }: Pick<ApplicationRole, "memberCount" | "directMemberCount">
) {
  if (directMemberCount === memberCount) return null
  if (directMemberCount === 0) return t("lists.members.allViaGroups")

  return t("lists.members.direct", { count: directMemberCount })
}

export function createRoleColumns(
  organizationId: string,
  { t, format }: RoleColumnContext,
  { onEdit, onManageMembers, onManageGroups, onRemove }: RoleActions
): ColumnDef<typeof serverTableFeatures, ApplicationRole>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("rolesTable.columns.role")}
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
      header: () => t("rolesTable.columns.key"),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.key}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "applications",
      header: () => t("rolesTable.columns.applications"),
      cell: ({ row }) => (
        <IdentityListPopover
          title={t("lists.applications.title")}
          count={row.original.applications.length}
          countLabel={t("lists.applications.count", {
            count: row.original.applications.length,
          })}
          preview={row.original.applications.map((covered) => ({
            id: covered.clientId,
            name: covered.name,
            image: covered.icon,
          }))}
        />
      ),
      enableSorting: false,
    },
    {
      id: "members",
      header: () => t("rolesTable.columns.members"),
      cell: ({ row }) => {
        const role = row.original

        return (
          <IdentityListPopover
            // A changed count means the lazily loaded list is stale.
            key={`${role.id}-${role.memberCount}-${role.directMemberCount}`}
            title={t("lists.members.title")}
            count={role.memberCount}
            countLabel={t("lists.members.count", { count: role.memberCount })}
            description={describeMemberCount(t, role)}
            preview={role.memberPreview.map((person) => ({
              id: person.id,
              name: person.name,
              secondary: person.email,
              image: person.image,
            }))}
            load={async () => {
              const result = await getRoleMembers(organizationId, role.id)
              if (!result.success) return result

              return {
                success: true,
                data: result.data.map((holder) => ({
                  id: holder.id,
                  name: holder.name,
                  secondary: describeRoleSource(t, format, holder),
                  image: holder.image,
                })),
              }
            }}
          />
        )
      },
      enableSorting: false,
    },
    {
      id: "groups",
      header: () => t("rolesTable.columns.groups"),
      cell: ({ row }) => {
        // The same badges as the members table's Groups column.
        return (
          <KeyedBadges
            title={t("lists.groups.title")}
            singularLabel={t("lists.groups.singular")}
            pluralLabel={t("lists.groups.plural")}
            variant="outline"
            items={row.original.groups}
          />
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("rolesTable.columns.created")}
        />
      ),
      cell: ({ row }) => <CreatedCell createdAt={row.original.createdAt} />,
    },
    {
      id: "actions",
      header: () => (
        <span className="sr-only">{t("rolesTable.columns.actions")}</span>
      ),
      cell: ({ row }) => {
        const role = row.original

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("rolesTable.actions.menu", {
                      name: role.name,
                    })}
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-auto min-w-48 whitespace-nowrap"
              >
                <DropdownMenuItem onClick={() => onEdit(role)}>
                  <Pencil />
                  {t("rolesTable.actions.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onManageMembers(role)}>
                  <UsersRound />
                  {t("rolesTable.actions.manageMembers")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onManageGroups(role)}>
                  <Network />
                  {t("rolesTable.actions.manageGroups")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onRemove(role)}
                >
                  <Trash2 />
                  {t("rolesTable.actions.delete")}
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
