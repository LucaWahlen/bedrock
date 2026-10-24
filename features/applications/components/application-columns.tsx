"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Ellipsis, KeyRound, Pencil, Plug, Trash2 } from "lucide-react"
import Link from "next/link"

import {
  ApplicationNameCell,
  ApplicationTypeCell,
  CreatedCell,
} from "@/features/applications/components/application-cells"
import { RoleNames } from "@/features/applications/components/role-names"
import type {
  Application,
  InstanceApplication,
} from "@/features/applications/types"
import { DataTableSortableHeader } from "@/features/shared/components/data-table/sortable-header"
import { serverTableFeatures } from "@/features/shared/components/data-table/table-state"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { Button } from "@/features/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import type { Translator } from "@/features/shared/lib/i18n/translator"

type ColumnTranslators = {
  t: Translator<"applications">
  tCommon: Translator<"common">
}

type ApplicationActions = {
  onConnect: (application: Application) => void
  onEdit?: (application: Application) => void
  onRotate?: (application: Application) => void
  onRemove?: (application: Application) => void
}

function nameColumn<T extends Application>({
  t,
}: ColumnTranslators): ColumnDef<typeof serverTableFeatures, T> {
  return {
    id: "name",
    accessorFn: (application) => application.name,
    header: ({ column }) => (
      <DataTableSortableHeader
        column={column}
        label={t("applicationsTable.columns.application")}
      />
    ),
    cell: ({ row }) => <ApplicationNameCell application={row.original} />,
    enableSorting: true,
  }
}

function detailColumns<T extends Application>(
  { t, tCommon }: ColumnTranslators,
  actions: ApplicationActions
): ColumnDef<typeof serverTableFeatures, T>[] {
  return [
    {
      id: "clientId",
      header: () => t("applicationsTable.columns.clientId"),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.clientId}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "roles",
      header: () => t("applicationsTable.columns.roles"),
      cell: ({ row }) => <RoleNames roles={row.original.roles} />,
      enableSorting: false,
    },
    {
      id: "type",
      header: () => t("applicationsTable.columns.type"),
      cell: ({ row }) => <ApplicationTypeCell application={row.original} />,
      enableSorting: false,
    },
    {
      id: "createdAt",
      accessorFn: (application) => application.createdAt,
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("applicationsTable.columns.created")}
        />
      ),
      cell: ({ row }) => <CreatedCell createdAt={row.original.createdAt} />,
    },
    {
      id: "actions",
      header: () => (
        <span className="sr-only">
          {t("applicationsTable.columns.actions")}
        </span>
      ),
      cell: ({ row }) => {
        const application = row.original
        const { onConnect, onEdit, onRotate, onRemove } = actions

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("applicationsTable.actions.menu", {
                      name: application.name,
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
                <DropdownMenuItem onClick={() => onConnect(application)}>
                  <Plug />
                  {t("applicationsTable.actions.connect")}
                </DropdownMenuItem>
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(application)}>
                    <Pencil />
                    {tCommon("actions.edit")}
                  </DropdownMenuItem>
                )}
                {onRotate && application.isConfidential && (
                  <DropdownMenuItem onClick={() => onRotate(application)}>
                    <KeyRound />
                    {t("applicationsTable.actions.rotate")}
                  </DropdownMenuItem>
                )}
                {onRemove && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onRemove(application)}
                    >
                      <Trash2 />
                      {tCommon("actions.delete")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
      enableSorting: false,
    },
  ]
}

export function createApplicationColumns(
  translators: ColumnTranslators,
  actions: Required<ApplicationActions>
): ColumnDef<typeof serverTableFeatures, Application>[] {
  return [nameColumn(translators), ...detailColumns(translators, actions)]
}

// Read-only: root sees every application but manages none of them.
export function createInstanceApplicationColumns(
  translators: ColumnTranslators,
  onConnect: (application: Application) => void
): ColumnDef<typeof serverTableFeatures, InstanceApplication>[] {
  return [
    nameColumn(translators),
    {
      id: "organization",
      header: () => translators.t("applicationsTable.columns.organization"),
      cell: ({ row }) => {
        const { organization } = row.original

        return (
          <Link
            href={`/org/${organization.slug}/applications`}
            className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <IdentityLabel
              name={organization.name}
              secondary={organization.slug}
              avatar={{ seed: organization.id, logo: organization.logo }}
            />
          </Link>
        )
      },
      enableSorting: false,
    },
    ...detailColumns<InstanceApplication>(translators, { onConnect }),
  ]
}
