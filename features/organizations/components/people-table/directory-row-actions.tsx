"use client"

import { Ban, Copy, Ellipsis, Hash, UserRoundCheck } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { enableAccount } from "@/features/organizations/actions/enable-account"
import { OrganizationActionDialog } from "@/features/organizations/components/organization-action-dialog"
import { DisableAccountDialog } from "@/features/organizations/components/people-table/disable-account-dialog"
import type { DirectoryPerson } from "@/features/organizations/types"
import { Button } from "@/features/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { copyToClipboard } from "@/features/shared/lib/ui/clipboard"

type DirectoryRowActionsProps = {
  person: DirectoryPerson
}

// The directory is root's alone, so whoever sees this menu is a root
// administrator. The actions recheck that, and everything else, themselves.
export function DirectoryRowActions({ person }: DirectoryRowActionsProps) {
  const t = useTranslations("organizations")
  const [dialog, setDialog] = useState<"disable" | "enable" | null>(null)
  const [isPending, startTransition] = useTransition()

  function enable() {
    startTransition(async () => {
      const result = await enableAccount(person.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      setDialog(null)
      toast.success(t("directory.enabled", { name: person.name }))
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
              aria-label={t("people.actionsFor", { name: person.name })}
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
            onClick={() =>
              copyToClipboard(person.email, t("people.emailAddress"))
            }
          >
            <Copy />
            {t("people.copyEmailAddress")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => copyToClipboard(person.id, t("people.userId"))}
          >
            <Hash />
            {t("people.copyUserId")}
          </DropdownMenuItem>
          {!person.isSelf && <DropdownMenuSeparator />}
          {!person.isSelf &&
            (person.disabled ? (
              <DropdownMenuItem onClick={() => setDialog("enable")}>
                <UserRoundCheck />
                {t("directory.enableAccount")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog("disable")}
              >
                <Ban />
                {t("directory.disableAccount")}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DisableAccountDialog
        person={person}
        open={dialog === "disable"}
        onOpenChange={(open) => setDialog(open ? "disable" : null)}
      />
      <OrganizationActionDialog
        open={dialog === "enable"}
        onOpenChange={(open) => setDialog(open ? "enable" : null)}
        title={t("directory.enableDialog.title", { name: person.name })}
        description={t("directory.enableDialog.description", {
          email: person.email,
        })}
        confirmLabel={t("directory.enableAccount")}
        pending={isPending}
        onConfirm={enable}
      />
    </>
  )
}
