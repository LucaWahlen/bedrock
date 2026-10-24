"use client"

import { type SortingState, useTable } from "@tanstack/react-table"
import { UserPlus } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { debounce, useQueryStates } from "nuqs"
import { useMemo, useState, useTransition } from "react"

import type { ApplicationRoleOption } from "@/features/applications"
import type { GroupOption } from "@/features/groups"
import { AddPeopleDialog } from "@/features/organizations/components/people-table/add-people-dialog"
import { createMemberColumns } from "@/features/organizations/components/people-table/member-columns"
import { MEMBER_ROLE_DISPLAY } from "@/features/organizations/lib/member-role-display"
import { MEMBER_STATUS_DISPLAY } from "@/features/organizations/lib/member-status-display"
import { membersSearchParams } from "@/features/organizations/lib/people-search-params"
import {
  MEMBER_ROLES,
  MEMBER_STATUSES,
  ROOT_MEMBER_ROLES,
  type MemberRole,
  type MemberStatus,
  type Organization,
  type OrganizationMembersResult,
  type PeopleSort,
} from "@/features/organizations/types"
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

type MembersTableProps = {
  organization: Organization
  result: OrganizationMembersResult
  applicationRoles: ApplicationRoleOption[]
  groups: GroupOption[]
}

export function MembersTable({
  organization,
  result,
  applicationRoles,
  groups,
}: MembersTableProps) {
  const t = useTranslations("organizations")
  const format = useFormatter()
  const [isPending, startTransition] = useTransition()
  const [isAdding, setIsAdding] = useState(false)
  const [
    { search, role, status, applicationRole, group, sort, direction, page },
    setQuery,
  ] = useQueryStates(membersSearchParams, { shallow: false, startTransition })
  const sorting: SortingState = [{ id: sort, desc: direction === "desc" }]
  const columns = useMemo(
    () =>
      createMemberColumns(
        t,
        format,
        organization,
        result.capabilities,
        applicationRoles,
        groups
      ),
    [t, format, organization, result.capabilities, applicationRoles, groups]
  )
  const roleOptions: FacetOption[] = (
    organization.isRoot ? ROOT_MEMBER_ROLES : MEMBER_ROLES
  ).map((value) => ({
    value,
    label: t(`roles.${value}.label`),
    icon: MEMBER_ROLE_DISPLAY[value].icon,
    count: result.roleCounts[value],
  }))
  const statusOptions: FacetOption[] = MEMBER_STATUSES.map((value) => ({
    value,
    label: t(`memberStatus.${value}`),
    icon: MEMBER_STATUS_DISPLAY[value].icon,
    count: result.statusCounts[value],
  }))
  // Counted over effective roles, held directly or through a group, which is
  // also what the filter matches.
  const applicationRoleOptions: FacetOption[] = applicationRoles.map(
    (option) => ({
      value: option.id,
      label: option.name,
      description: option.key,
      count: result.applicationRoleCounts[option.id] ?? 0,
    })
  )
  const groupOptions: FacetOption[] = groups.map((option) => ({
    value: option.id,
    label: option.name,
    description: option.key,
    count: result.groupCounts[option.id] ?? 0,
  }))

  const table = useTable({
    features: serverTableFeatures,
    data: result.members,
    columns,
    getRowId: (member) => member.id,
    ...serverTableState({
      sorting,
      page,
      total: result.total,
      pageSize: result.pageSize,
      toSortPatch: (next): { sort: PeopleSort; direction: SortDirection } => ({
        sort:
          next?.id === "addedAt"
            ? "createdAt"
            : next?.id === "lastActiveAt"
              ? "lastActiveAt"
              : "name",
        direction: next?.desc ? "desc" : "asc",
      }),
      setQuery,
    }),
  })

  const hasFilters =
    search.length > 0 ||
    role.length > 0 ||
    status.length > 0 ||
    applicationRole.length > 0 ||
    group.length > 0

  return (
    <>
      <DataTableLayout
        pending={isPending}
        toolbar={
          <DataTableToolbar
            entityLabel={t("members.table.searchEntity")}
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
                      role: [],
                      status: [],
                      applicationRole: [],
                      group: [],
                      page: 0,
                    })
                : undefined
            }
            action={
              result.capabilities.canManageMembers && (
                <Button onClick={() => setIsAdding(true)}>
                  <UserPlus />
                  {t("members.addPeople")}
                </Button>
              )
            }
          >
            <DataTableFacetedFilter
              title={t("members.filters.role")}
              options={roleOptions}
              selected={role}
              onChange={(values) =>
                setQuery({ role: values as MemberRole[], page: 0 })
              }
            />
            <DataTableFacetedFilter
              title={t("members.filters.status")}
              options={statusOptions}
              selected={status}
              onChange={(values) =>
                setQuery({ status: values as MemberStatus[], page: 0 })
              }
            />
            {result.capabilities.canManageApplicationRoles &&
              applicationRoles.length > 0 && (
                <DataTableFacetedFilter
                  title={t("members.filters.applicationRole")}
                  options={applicationRoleOptions}
                  selected={applicationRole}
                  onChange={(values) =>
                    setQuery({ applicationRole: values, page: 0 })
                  }
                />
              )}
            {result.capabilities.canManageApplicationRoles &&
              groups.length > 0 && (
                <DataTableFacetedFilter
                  title={t("members.filters.group")}
                  options={groupOptions}
                  selected={group}
                  onChange={(values) => setQuery({ group: values, page: 0 })}
                />
              )}
          </DataTableToolbar>
        }
        pagination={
          <DataTablePagination
            table={table}
            singularLabel={t("members.table.unitOne")}
            pluralLabel={t("members.table.unitOther")}
          />
        }
      >
        <DataTable
          table={table}
          emptyMessage={t("members.table.empty")}
          ariaLabel={t("members.table.label")}
          shrinkColumnIds={["actions"]}
        />
      </DataTableLayout>

      <AddPeopleDialog
        organization={organization}
        capabilities={result.capabilities}
        open={isAdding}
        onOpenChange={setIsAdding}
      />
    </>
  )
}
