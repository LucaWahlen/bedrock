"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Ban } from "lucide-react"
import type { useFormatter } from "next-intl"

import { LastActive } from "@/features/organizations/components/last-active"
import { DirectoryRowActions } from "@/features/organizations/components/people-table/directory-row-actions"
import { MemberStatusBadge } from "@/features/organizations/components/people-table/member-status-badge"
import { OrganizationMembershipsPopover } from "@/features/organizations/components/people-table/organization-memberships-popover"
import type { DirectoryPerson } from "@/features/organizations/types"
import { DataTableSortableHeader } from "@/features/shared/components/data-table/sortable-header"
import { serverTableFeatures } from "@/features/shared/components/data-table/table-state"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { Badge } from "@/features/shared/components/ui/badge"
import type { Translator } from "@/features/shared/lib/i18n/translator"

export function createDirectoryColumns(
  t: Translator<"organizations">,
  format: ReturnType<typeof useFormatter>
): ColumnDef<typeof serverTableFeatures, DirectoryPerson>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("directory.columns.user")}
        />
      ),
      cell: ({ row }) => (
        <IdentityLabel
          name={row.original.name}
          secondary={row.original.email}
          avatar={{ seed: row.original.id, logo: row.original.image }}
        />
      ),
      enableSorting: true,
    },
    {
      id: "organizations",
      header: () => t("directory.columns.organizations"),
      cell: ({ row }) => (
        <OrganizationMembershipsPopover
          userId={row.original.id}
          userName={row.original.name}
          count={row.original.organizationCount}
          preview={row.original.organizationPreview}
        />
      ),
      enableSorting: false,
    },
    {
      id: "emailVerified",
      header: () => t("directory.columns.status"),
      cell: ({ row }) => {
        const { disabled, emailVerified } = row.original

        // One badge: being disabled outranks the state of the address.
        return disabled ? (
          <Badge
            className="bg-red-500/15 text-red-700 dark:text-red-300"
            title={
              disabled.reason
                ? t("directory.disabledSinceBecause", {
                    date: format.dateTime(new Date(disabled.at), "date"),
                    reason: disabled.reason,
                  })
                : t("directory.disabledSince", {
                    date: format.dateTime(new Date(disabled.at), "date"),
                  })
            }
          >
            <Ban data-icon="inline-start" aria-hidden="true" />
            {t("accountStatus.disabled")}
          </Badge>
        ) : (
          <MemberStatusBadge
            status={emailVerified ? "confirmed" : "unconfirmed"}
          />
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: "lastActiveAt",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("directory.columns.active")}
        />
      ),
      cell: ({ getValue }) => <LastActive value={getValue<string | null>()} />,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("directory.columns.created")}
        />
      ),
      cell: ({ getValue }) => (
        <time dateTime={getValue<string>()}>
          {format.dateTime(new Date(getValue<string>()), "date")}
        </time>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("columns.actions")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DirectoryRowActions person={row.original} />
        </div>
      ),
      enableSorting: false,
    },
  ]
}
