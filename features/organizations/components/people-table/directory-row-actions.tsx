"use client"

import {
  Ban,
  Copy,
  Ellipsis,
  Hash,
  KeyRound,
  LogOut,
  MailCheck,
  Send,
  ShieldOff,
  Trash2,
  UserRoundCheck,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { deleteUser } from "@/features/account"
import { enableAccount } from "@/features/organizations/actions/enable-account"
import { markUserVerified } from "@/features/organizations/actions/mark-user-verified"
import { resetUserSecondFactor } from "@/features/organizations/actions/reset-user-second-factor"
import { sendUserPasswordReset } from "@/features/organizations/actions/send-user-password-reset"
import { sendUserVerification } from "@/features/organizations/actions/send-user-verification"
import { signOutUser } from "@/features/organizations/actions/sign-out-user"
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
import type { ActionResult } from "@/features/shared/types"

type DirectoryRowActionsProps = {
  person: DirectoryPerson
}

type DialogKind =
  | "disable"
  | "enable"
  | "signOut"
  | "resetSecondFactor"
  | "delete"

// The directory is root's alone, so whoever sees this menu is a root
// administrator. Every action rechecks that, and everything else, itself.
export function DirectoryRowActions({ person }: DirectoryRowActionsProps) {
  const t = useTranslations("organizations")
  const tAdmin = useTranslations("organizations.userAdmin")
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(
    action: () => Promise<ActionResult>,
    success: string,
    { closes = true }: { closes?: boolean } = {}
  ) {
    startTransition(async () => {
      const result = await action().catch(() => null)
      if (!result?.success) {
        toast.error(result?.error ?? tAdmin("errors.failed"))
        return
      }

      if (closes) setDialog(null)
      toast.success(success)
    })
  }

  const confirmations = {
    enable: {
      title: t("directory.enableDialog.title", { name: person.name }),
      description: t("directory.enableDialog.description", {
        email: person.email,
      }),
      confirmLabel: t("directory.enableAccount"),
      variant: "default",
      confirmSlug: null,
      onConfirm: () =>
        run(
          () => enableAccount(person.id),
          t("directory.enabled", { name: person.name })
        ),
    },
    signOut: {
      title: tAdmin("signOut.title", { name: person.name }),
      description: tAdmin("signOut.description", { name: person.name }),
      confirmLabel: tAdmin("signOut.menu"),
      variant: "destructive",
      confirmSlug: null,
      onConfirm: () =>
        run(
          () => signOutUser(person.id),
          tAdmin("signOut.done", { name: person.name })
        ),
    },
    resetSecondFactor: {
      title: tAdmin("resetSecondFactor.title", { name: person.name }),
      description: tAdmin("resetSecondFactor.description"),
      confirmLabel: tAdmin("resetSecondFactor.menu"),
      variant: "destructive",
      confirmSlug: null,
      onConfirm: () =>
        run(
          () => resetUserSecondFactor(person.id),
          tAdmin("resetSecondFactor.done", { name: person.name })
        ),
    },
    delete: {
      title: tAdmin("delete.title", { name: person.name }),
      description: tAdmin("delete.description", { email: person.email }),
      confirmLabel: tAdmin("delete.menu"),
      variant: "destructive",
      confirmSlug: person.email,
      onConfirm: () =>
        run(
          () => deleteUser(person.id),
          tAdmin("delete.done", { name: person.name })
        ),
    },
  } as const
  const confirmation =
    dialog && dialog in confirmations
      ? confirmations[dialog as keyof typeof confirmations]
      : null

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
          {!person.isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isPending}
                onClick={() =>
                  run(
                    () => sendUserPasswordReset(person.id),
                    tAdmin("sendReset.sent", { email: person.email })
                  )
                }
              >
                <KeyRound />
                {tAdmin("sendReset.menu")}
              </DropdownMenuItem>
              {!person.emailVerified && (
                <>
                  <DropdownMenuItem
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => sendUserVerification(person.id),
                        tAdmin("sendVerification.sent", {
                          email: person.email,
                        })
                      )
                    }
                  >
                    <Send />
                    {tAdmin("sendVerification.menu")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => markUserVerified(person.id),
                        tAdmin("markVerified.done", { email: person.email })
                      )
                    }
                  >
                    <MailCheck />
                    {tAdmin("markVerified.menu")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => setDialog("signOut")}>
                <LogOut />
                {tAdmin("signOut.menu")}
              </DropdownMenuItem>
              {person.twoFactorEnabled && (
                <DropdownMenuItem
                  onClick={() => setDialog("resetSecondFactor")}
                >
                  <ShieldOff />
                  {tAdmin("resetSecondFactor.menu")}
                </DropdownMenuItem>
              )}
              {person.disabled ? (
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
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDialog("delete")}
              >
                <Trash2 />
                {tAdmin("delete.menu")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DisableAccountDialog
        person={person}
        open={dialog === "disable"}
        onOpenChange={(open) => setDialog(open ? "disable" : null)}
      />
      <OrganizationActionDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        title={confirmation?.title}
        description={confirmation?.description}
        confirmLabel={confirmation?.confirmLabel}
        variant={confirmation?.variant}
        confirmSlug={confirmation?.confirmSlug}
        pending={isPending}
        onConfirm={() => confirmation?.onConfirm()}
      />
    </>
  )
}
