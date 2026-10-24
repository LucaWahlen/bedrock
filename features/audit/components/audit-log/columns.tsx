"use client"

import type { ColumnDef } from "@tanstack/react-table"
import {
  AppWindow,
  AtSign,
  Ban,
  CirclePause,
  CirclePlay,
  CirclePlus,
  Fingerprint,
  Flame,
  KeyRound,
  ListRestart,
  LogIn,
  LogOut,
  MailCheck,
  MailPlus,
  MailX,
  MonitorX,
  Network,
  Pencil,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldEllipsis,
  ShieldOff,
  SquarePen,
  Tag,
  TagsIcon,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRoundCog,
  UserRoundMinus,
  UserRoundPen,
  UserRoundPlus,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import type { useFormatter } from "next-intl"

import { AuditEventRowActions } from "@/features/audit/components/audit-log/row-actions"
import { AUDIT_OUTCOME_DISPLAY } from "@/features/audit/lib/audit-outcome-display"
import type { AuditAction, AuditEventDisplay } from "@/features/audit/types"
import { describeAuditAction } from "@/features/audit/utils/describe-audit-action"
import type { Organization } from "@/features/organizations"
import { DataTableSortableHeader } from "@/features/shared/components/data-table/sortable-header"
import { serverTableFeatures } from "@/features/shared/components/data-table/table-state"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { Badge } from "@/features/shared/components/ui/badge"
import type { Translator } from "@/features/shared/lib/i18n/translator"

const actionIcons: Record<AuditAction, LucideIcon> = {
  "organization.created": CirclePlus,
  "organization.updated": Pencil,
  "organization.suspended": CirclePause,
  "organization.reactivated": CirclePlay,
  "organization.deleted": Trash2,
  "organization.restored": RotateCcw,
  "organization.purged": Flame,
  "organization.member_added": UserRoundPlus,
  "organization.member_removed": UserRoundMinus,
  "organization.member_role_changed": UserRoundCog,
  "organization.member_invited": MailPlus,
  "organization.invitation_resent": Send,
  "organization.invitation_revoked": MailX,
  "organization.invitation_accepted": UserRoundCheck,
  "application.created": AppWindow,
  "application.updated": SquarePen,
  "application.deleted": Trash2,
  "application.secret_rotated": KeyRound,
  "application.role_created": Tag,
  "application.role_updated": SquarePen,
  "application.role_deleted": Trash2,
  "application.roles_assigned": TagsIcon,
  "application.role_members_changed": UsersRound,
  "application.role_groups_changed": Network,
  "group.created": Network,
  "group.updated": SquarePen,
  "group.deleted": Trash2,
  "group.members_changed": UsersRound,
  "group.roles_changed": TagsIcon,
  "user.created": UserPlus,
  "user.disabled": Ban,
  "user.enabled": UserRoundCheck,
  "account.profile_updated": UserRoundPen,
  "account.password_changed": KeyRound,
  "account.email_change_requested": AtSign,
  "account.email_changed": MailCheck,
  "account.session_revoked": MonitorX,
  "account.sessions_revoked": MonitorX,
  "account.two_factor_enabled": ShieldCheck,
  "account.two_factor_disabled": ShieldOff,
  "account.two_factor_reset": ShieldAlert,
  "account.backup_codes_regenerated": ListRestart,
  "account.passkey_added": Fingerprint,
  "account.passkey_renamed": SquarePen,
  "account.passkey_removed": Trash2,
  "account.deleted": UserRoundX,
  "authentication.login": LogIn,
  "authentication.two_factor_challenged": ShieldEllipsis,
  "authentication.logout": LogOut,
  "authentication.email_verified": MailCheck,
  "authentication.password_reset_requested": KeyRound,
  "authentication.password_reset": ShieldCheck,
}

// Actions are free-form text in the database, so an icon may be missing.
const actionIconsByAction: Record<string, LucideIcon | undefined> = actionIcons

type AuditColumn = ColumnDef<typeof serverTableFeatures, AuditEventDisplay>

type ColumnContext = {
  t: Translator<"audit">
  tCommon: Translator<"common">
  format: ReturnType<typeof useFormatter>
}

function createActionColumn({ t }: ColumnContext): AuditColumn {
  return {
    accessorKey: "action",
    header: () => t("columns.event"),
    enableSorting: false,
    cell: ({ row }) => {
      const event = row.original
      const ActionIcon = actionIconsByAction[event.action]
      const subject =
        event.targetId === event.organization?.id ? null : event.targetLabel
      const subtitle = subject ?? event.reason

      return (
        <div className="flex items-center gap-2">
          {ActionIcon && (
            <ActionIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <span className="truncate font-medium">
              {describeAuditAction(t, event.action)}
            </span>
            {subtitle && (
              <div className="truncate text-xs text-muted-foreground">
                {subtitle}
              </div>
            )}
          </div>
        </div>
      )
    },
  }
}

function createOutcomeColumn({ t }: ColumnContext): AuditColumn {
  return {
    accessorKey: "outcome",
    header: () => t("columns.outcome"),
    enableSorting: false,
    cell: ({ row }) => {
      const outcome = AUDIT_OUTCOME_DISPLAY[row.original.outcome]
      const OutcomeIcon = outcome.icon

      return (
        <Badge className={outcome.className}>
          <OutcomeIcon data-icon="inline-start" aria-hidden="true" />
          {t(`outcomes.${row.original.outcome}`)}
        </Badge>
      )
    },
  }
}

function createOrganizationColumn({ t, tCommon }: ColumnContext): AuditColumn {
  return {
    id: "organization",
    header: () => t("columns.organization"),
    enableSorting: false,
    cell: ({ row }) => {
      const eventOrganization = row.original.organization
      if (!eventOrganization) {
        return (
          <span className="text-muted-foreground">
            {tCommon("states.none")}
          </span>
        )
      }

      return (
        <IdentityLabel
          name={eventOrganization.name}
          secondary={eventOrganization.slug}
          avatar={{
            seed: eventOrganization.id,
            logo: eventOrganization.current?.logo,
          }}
          indicator={
            eventOrganization.current?.isRoot ? "organization" : undefined
          }
          deleted={eventOrganization.isDeleted}
          renamedTo={
            eventOrganization.current &&
            eventOrganization.current.name !== eventOrganization.name
              ? eventOrganization.current.name
              : null
          }
        />
      )
    },
  }
}

// System actions are attributed to the root organization, which administers
// the instance.
export type RootOrganization = Pick<
  Organization,
  "id" | "name" | "slug" | "logo"
>

function createActorColumn(
  { t }: ColumnContext,
  rootOrganization: RootOrganization
): AuditColumn {
  return {
    id: "actor",
    header: () => t("columns.actor"),
    enableSorting: false,
    cell: ({ row }) => {
      const { actor } = row.original

      if (actor.type === "system") {
        return (
          <IdentityLabel
            name={rootOrganization.name}
            secondary={rootOrganization.slug}
            avatar={{
              seed: rootOrganization.id,
              logo: rootOrganization.logo,
            }}
            indicator="organization"
          />
        )
      }

      if (actor.type !== "user") {
        // Only the address a failed sign-in used is known.
        return actor.email ? (
          <IdentityLabel name={actor.email} secondary={t("actor.anonymous")} />
        ) : (
          <span className="text-muted-foreground">{t("actor.anonymous")}</span>
        )
      }

      const actorName = actor.name ?? t("actor.deletedUser")

      return (
        <IdentityLabel
          name={actorName}
          secondary={actor.email}
          avatar={{
            seed: actor.id,
            logo: actor.current?.image,
          }}
          indicator={actor.isRootActor ? "actor" : undefined}
          deleted={actor.isDeleted}
          renamedTo={
            actor.current && actor.current.name !== actor.name
              ? actor.current.name
              : null
          }
        />
      )
    },
  }
}

function createCreatedAtColumn({ t, format }: ColumnContext): AuditColumn {
  return {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableSortableHeader column={column} label={t("columns.timestamp")} />
    ),
    enableSorting: true,
    cell: ({ getValue }) => (
      <time
        dateTime={getValue<string>()}
        className="whitespace-nowrap text-muted-foreground"
      >
        {format.dateTime(new Date(getValue<string>()), "dateTime")}
      </time>
    ),
  }
}

function createActionsColumn({ t }: ColumnContext): AuditColumn {
  return {
    id: "actions",
    header: () => <span className="sr-only">{t("columns.actions")}</span>,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <AuditEventRowActions event={row.original} />
      </div>
    ),
  }
}

export function createAuditColumns(
  showOrganization: boolean,
  rootOrganization: RootOrganization,
  context: ColumnContext
): AuditColumn[] {
  return [
    createActionColumn(context),
    createOutcomeColumn(context),
    ...(showOrganization ? [createOrganizationColumn(context)] : []),
    createActorColumn(context, rootOrganization),
    createCreatedAtColumn(context),
    createActionsColumn(context),
  ]
}
