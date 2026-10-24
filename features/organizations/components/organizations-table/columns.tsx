"use client"

import type { ColumnDef } from "@tanstack/react-table"
import type { useFormatter } from "next-intl"

import { OrganizationPeoplePopover } from "@/features/organizations/components/organizations-table/organization-people-popover"
import { OrganizationRowActions } from "@/features/organizations/components/organizations-table/row-actions"
import { ORGANIZATION_STATUS_DISPLAY } from "@/features/organizations/lib/organization-status-display"
import type { OrganizationDisplay } from "@/features/organizations/types"
import { DataTableSortableHeader } from "@/features/shared/components/data-table/sortable-header"
import { serverTableFeatures } from "@/features/shared/components/data-table/table-state"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { Badge } from "@/features/shared/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/features/shared/components/ui/tooltip"
import type { Translator } from "@/features/shared/lib/i18n/translator"

export function createOrganizationColumns(
  t: Translator<"organizations">,
  format: ReturnType<typeof useFormatter>
): ColumnDef<typeof serverTableFeatures, OrganizationDisplay>[] {
  return [
    {
      accessorKey: "name",
      cell: ({ row }) => {
        const organization = row.original

        return (
          <IdentityLabel
            name={organization.name}
            secondary={organization.slug}
            avatar={{ seed: organization.id, logo: organization.logo }}
            indicator={organization.isRoot ? "organization" : undefined}
          />
        )
      },
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("organizationsTable.columns.organization")}
        />
      ),
      enableSorting: true,
    },
    {
      accessorKey: "status",
      header: () => t("organizationsTable.columns.status"),
      enableSorting: false,
      cell: ({ row }) => {
        const organization = row.original
        const status = ORGANIZATION_STATUS_DISPLAY[organization.status]
        const StatusIcon = status.icon
        const statusBadge = (
          <Badge className={status.className}>
            <StatusIcon data-icon="inline-start" aria-hidden="true" />
            {t(`organizationStatus.${organization.status}`)}
          </Badge>
        )

        if (organization.status === "active") {
          return statusBadge
        }

        const statusChange = organization.lastStatusChange

        return (
          <Tooltip>
            <TooltipTrigger>{statusBadge}</TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-0.5 text-center">
                <div>
                  {statusChange
                    ? statusChange.actorName
                      ? t("organizationsTable.statusChangedBy", {
                          name: statusChange.actorName,
                          date: format.dateTime(
                            new Date(statusChange.changedAt),
                            "date"
                          ),
                        })
                      : t("organizationsTable.statusChanged", {
                          date: format.dateTime(
                            new Date(statusChange.changedAt),
                            "date"
                          ),
                        })
                    : t("organizationsTable.noHistory")}
                </div>
                {organization.purgeScheduledFor && (
                  <div>
                    {t("organizationsTable.purgedOn", {
                      date: format.dateTime(
                        new Date(organization.purgeScheduledFor),
                        "date"
                      ),
                    })}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      id: "administrators",
      header: () => t("organizationsTable.columns.administrators"),
      cell: ({ row }) => (
        <OrganizationPeoplePopover
          organizationId={row.original.id}
          kind="administrators"
          count={row.original.administratorCount}
          preview={row.original.administratorPreview}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: "memberCount",
      header: () => t("organizationsTable.columns.members"),
      cell: ({ row }) => (
        <OrganizationPeoplePopover
          organizationId={row.original.id}
          kind="members"
          count={row.original.memberCount}
          preview={row.original.memberPreview}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("organizationsTable.columns.created")}
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
          <OrganizationRowActions organization={row.original} />
        </div>
      ),
      enableSorting: false,
    },
  ]
}
