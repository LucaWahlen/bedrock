"use client"

import { Copy, Ellipsis, Hash, MailX, Send } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { resendInvitation } from "@/features/organizations/actions/resend-invitation"
import { revokeInvitation } from "@/features/organizations/actions/revoke-invitation"
import type {
  InvitedMember,
  MemberCapabilities,
  Organization,
} from "@/features/organizations/types"
import { Button } from "@/features/shared/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { copyToClipboard } from "@/features/shared/lib/ui/clipboard"

type InvitationRowActionsProps = {
  organization: Organization
  capabilities: MemberCapabilities
  invitation: InvitedMember
}

export function InvitationRowActions({
  organization,
  capabilities,
  invitation,
}: InvitationRowActionsProps) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const [isRevoking, setIsRevoking] = useState(false)
  const [isPending, startTransition] = useTransition()
  // An invited address may already belong to an account, which has an id worth
  // copying even though its holder is not a member here yet.
  const userId = invitation.userId

  function resend() {
    startTransition(async () => {
      const result = await resendInvitation(organization.id, invitation.id)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      if (result.delivered) {
        toast.success(
          t("invitationActions.resent", { email: invitation.email })
        )
      } else {
        toast.warning(t("invitationActions.renewedNotSent"))
      }
    })
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeInvitation(organization.id, invitation.id)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(
        t("invitationActions.withdrawn", { email: invitation.email })
      )
      setIsRevoking(false)
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
              aria-label={t("people.actionsFor", {
                name: invitation.name ?? invitation.email,
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
          <DropdownMenuItem
            onClick={() =>
              copyToClipboard(invitation.email, t("people.emailAddress"))
            }
          >
            <Copy />
            {t("people.copyEmailAddress")}
          </DropdownMenuItem>
          {userId && (
            <DropdownMenuItem
              onClick={() => copyToClipboard(userId, t("people.userId"))}
            >
              <Hash />
              {t("people.copyUserId")}
            </DropdownMenuItem>
          )}
          {capabilities.canManageMembers && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resend} disabled={isPending}>
                <Send />
                {t("invitationActions.sendAgain")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsRevoking(true)}
                disabled={isPending}
              >
                <MailX />
                {t("invitationActions.withdraw")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isRevoking} onOpenChange={setIsRevoking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("invitationActions.withdrawTitle")}</DialogTitle>
            <DialogDescription>
              {t("invitationActions.withdrawDescription", {
                email: invitation.email,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={isPending} />}
            >
              {tCommon("actions.cancel")}
            </DialogClose>
            <Button variant="destructive" onClick={revoke} disabled={isPending}>
              {isPending
                ? t("invitationActions.withdrawing")
                : t("invitationActions.withdraw")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
