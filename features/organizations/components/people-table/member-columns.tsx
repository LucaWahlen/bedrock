"use client"

import type { ColumnDef } from "@tanstack/react-table"
import type { useFormatter } from "next-intl"

import { RoleNames, type ApplicationRoleOption } from "@/features/applications"
import { GroupNames, type GroupOption } from "@/features/groups"
import { LastActive } from "@/features/organizations/components/last-active"
import { InvitationRowActions } from "@/features/organizations/components/people-table/invitation-row-actions"
import { MemberRowActions } from "@/features/organizations/components/people-table/member-row-actions"
import { MemberStatusBadge } from "@/features/organizations/components/people-table/member-status-badge"
import { RoleBadges } from "@/features/organizations/components/people-table/role-badges"
import { SecondFactorBadge } from "@/features/organizations/components/second-factor-badge"
import { memberStatusOf } from "@/features/organizations/lib/member-status-display"
import type {
  MemberCapabilities,
  Organization,
  OrganizationMember,
} from "@/features/organizations/types"
import { DataTableSortableHeader } from "@/features/shared/components/data-table/sortable-header"
import { serverTableFeatures } from "@/features/shared/components/data-table/table-state"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import type { Translator } from "@/features/shared/lib/i18n/translator"

export function createMemberColumns(
  t: Translator<"organizations">,
  format: ReturnType<typeof useFormatter>,
  organization: Organization,
  capabilities: MemberCapabilities,
  applicationRoles: ApplicationRoleOption[],
  groups: GroupOption[]
): ColumnDef<typeof serverTableFeatures, OrganizationMember>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("members.columns.member")}
        />
      ),
      cell: ({ row }) => {
        const { name, email, userId, image } = row.original

        return (
          <IdentityLabel
            name={name ?? email}
            secondary={name ? email : null}
            // A null seed is the neutral avatar, which is the honest picture of
            // an address nobody has claimed.
            avatar={{ seed: userId, logo: image }}
          />
        )
      },
      enableSorting: true,
    },
    {
      id: "roles",
      header: () => t("members.columns.roles"),
      cell: ({ row }) => <RoleBadges roles={row.original.roles} />,
      enableSorting: false,
    },
    ...(capabilities.canManageApplicationRoles
      ? [
          {
            id: "applicationRoles",
            header: () => t("members.columns.applicationRoles"),
            cell: ({ row }) =>
              row.original.pending ? (
                <span className="text-sm text-muted-foreground">
                  {t("none")}
                </span>
              ) : (
                <RoleNames roles={row.original.applicationRoles} />
              ),
            enableSorting: false,
          } satisfies ColumnDef<typeof serverTableFeatures, OrganizationMember>,
          {
            id: "groups",
            header: () => t("members.columns.groups"),
            cell: ({ row }) =>
              row.original.pending ? (
                <span className="text-sm text-muted-foreground">
                  {t("none")}
                </span>
              ) : (
                <GroupNames groups={row.original.groups} />
              ),
            enableSorting: false,
          } satisfies ColumnDef<typeof serverTableFeatures, OrganizationMember>,
        ]
      : []),
    {
      id: "status",
      header: () => t("members.columns.status"),
      cell: ({ row }) => {
        const { pending } = row.original

        return (
          <MemberStatusBadge
            status={memberStatusOf(row.original)}
            title={
              pending
                ? pending.inviterName
                  ? t("members.invitedByUntil", {
                      inviter: pending.inviterName,
                      date: format.dateTime(
                        new Date(pending.expiresAt),
                        "date"
                      ),
                    })
                  : t("members.invitedUntil", {
                      date: format.dateTime(
                        new Date(pending.expiresAt),
                        "date"
                      ),
                    })
                : undefined
            }
          />
        )
      },
      enableSorting: false,
    },
    ...(capabilities.canViewSecondFactors
      ? [
          {
            id: "secondFactor",
            header: () => t("members.columns.secondFactor"),
            cell: ({ row }) =>
              row.original.pending || !row.original.secondFactor ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                <SecondFactorBadge status={row.original.secondFactor} />
              ),
            enableSorting: false,
          } satisfies ColumnDef<typeof serverTableFeatures, OrganizationMember>,
        ]
      : []),
    {
      accessorKey: "lastActiveAt",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("members.columns.active")}
        />
      ),
      cell: ({ getValue }) => <LastActive value={getValue<string | null>()} />,
    },
    {
      accessorKey: "addedAt",
      header: ({ column }) => (
        <DataTableSortableHeader
          column={column}
          label={t("members.columns.added")}
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
          {row.original.pending ? (
            <InvitationRowActions
              organization={organization}
              capabilities={capabilities}
              invitation={row.original}
            />
          ) : (
            <MemberRowActions
              organization={organization}
              member={row.original}
              capabilities={capabilities}
              applicationRoles={applicationRoles}
              groups={groups}
            />
          )}
        </div>
      ),
      enableSorting: false,
    },
  ]
}
