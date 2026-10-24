"use client"

import {
  CirclePause,
  CirclePlay,
  Ellipsis,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteOrganization } from "@/features/organizations/actions/delete-organization"
import { restoreOrganization } from "@/features/organizations/actions/restore-organization"
import { setOrganizationSuspended } from "@/features/organizations/actions/set-organization-suspended"
import { OrganizationActionDialog } from "@/features/organizations/components/organization-action-dialog"
import type { OrganizationDisplay } from "@/features/organizations/types"
import { Button } from "@/features/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import type { ActionResult } from "@/features/shared/types"

// Its copy is `organizations.rowActions.<key>`.
type RowAction = {
  variant: "default" | "destructive"
  // Shutting an organization down is confirmed by name; letting it back in is
  // not, because it takes nothing away.
  confirmsBySlug: boolean
  run: (organizationId: string) => Promise<ActionResult>
}

const ROW_ACTIONS = {
  suspend: {
    variant: "destructive",
    confirmsBySlug: true,
    run: (organizationId) => setOrganizationSuspended(organizationId, true),
  },
  reactivate: {
    variant: "default",
    confirmsBySlug: false,
    run: (organizationId) => setOrganizationSuspended(organizationId, false),
  },
  delete: {
    variant: "destructive",
    confirmsBySlug: true,
    run: deleteOrganization,
  },
  restore: {
    variant: "default",
    confirmsBySlug: false,
    run: restoreOrganization,
  },
} satisfies Record<string, RowAction>

type RowActionKey = keyof typeof ROW_ACTIONS

type OrganizationRowActionsProps = {
  organization: OrganizationDisplay
}

export function OrganizationRowActions({
  organization,
}: OrganizationRowActionsProps) {
  const t = useTranslations("organizations.rowActions")
  const tCommon = useTranslations("common")
  const [pendingKey, setPendingKey] = useState<RowActionKey | null>(null)
  const [isPending, startTransition] = useTransition()
  const isSuspended = organization.status === "suspended"
  const isDeleted = organization.status === "deleted"
  const pendingRowAction = pendingKey ? ROW_ACTIONS[pendingKey] : null

  function submitAction() {
    if (!pendingKey || !pendingRowAction) return
    const key = pendingKey

    startTransition(async () => {
      const result = await pendingRowAction.run(organization.id)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setPendingKey(null)
      toast.success(t(`${key}.succeeded`, { name: organization.name }))
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={organization.isRoot}
              aria-label={t("actionsFor", { name: organization.name })}
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-auto min-w-48 whitespace-nowrap"
        >
          <DropdownMenuItem
            disabled={organization.isRoot || isDeleted}
            onClick={() =>
              setPendingKey(isSuspended ? "reactivate" : "suspend")
            }
          >
            {isSuspended ? <CirclePlay /> : <CirclePause />}
            {isSuspended ? t("reactivate.menu") : t("suspend.menu")}
          </DropdownMenuItem>
          {isDeleted ? (
            <DropdownMenuItem onClick={() => setPendingKey("restore")}>
              <RotateCcw />
              {t("restore.menu")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              disabled={organization.isRoot}
              onClick={() => setPendingKey("delete")}
            >
              <Trash2 />
              {tCommon("actions.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <OrganizationActionDialog
        open={pendingRowAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingKey(null)
        }}
        title={pendingKey ? t(`${pendingKey}.title`) : undefined}
        description={
          pendingKey
            ? t(`${pendingKey}.description`, { name: organization.name })
            : undefined
        }
        confirmLabel={pendingKey ? t(`${pendingKey}.confirm`) : undefined}
        variant={pendingRowAction?.variant}
        confirmSlug={
          pendingRowAction?.confirmsBySlug ? organization.slug : null
        }
        pending={isPending}
        onConfirm={submitAction}
      />
    </>
  )
}
