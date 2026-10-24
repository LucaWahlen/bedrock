"use client"

import {
  Copy,
  Ellipsis,
  Hash,
  KeyRound,
  Network,
  UserCog,
  UserMinus,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  MemberRolesDialog,
  type ApplicationRoleOption,
} from "@/features/applications"
import { MemberGroupsDialog, type GroupOption } from "@/features/groups"
import { removeMember } from "@/features/organizations/actions/remove-member"
import { setMemberRole } from "@/features/organizations/actions/set-member-role"
import {
  MEMBER_ROLE_DISPLAY,
  primaryRole,
} from "@/features/organizations/lib/member-role-display"
import {
  MEMBER_ROLES,
  ROOT_MEMBER_ROLES,
  type JoinedMember,
  type MemberCapabilities,
  type MemberRole,
  type Organization,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { copyToClipboard } from "@/features/shared/lib/ui/clipboard"

type MemberRowActionsProps = {
  organization: Organization
  member: JoinedMember
  capabilities: MemberCapabilities
  applicationRoles: ApplicationRoleOption[]
  groups: GroupOption[]
}

export function MemberRowActions({
  organization,
  member,
  capabilities,
  applicationRoles,
  groups,
}: MemberRowActionsProps) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const [isRemoving, setIsRemoving] = useState(false)
  const [isAssigningRoles, setIsAssigningRoles] = useState(false)
  const [isAssigningGroups, setIsAssigningGroups] = useState(false)
  // The role is kept after the dialog closes so the copy does not empty out
  // while it animates away.
  const [roleChange, setRoleChange] = useState<{
    role: MemberRole
    open: boolean
  }>()
  const [isPending, startTransition] = useTransition()
  const currentRole = primaryRole(member.roles)
  const assignableRoles = organization.isRoot ? ROOT_MEMBER_ROLES : MEMBER_ROLES
  const isOwner = member.roles.includes("owner")
  const managesTarget =
    capabilities.canManageMembers && (!isOwner || capabilities.canManageOwners)
  const offeredRoles = assignableRoles.filter(
    (role) => role !== "owner" || capabilities.canManageOwners
  )
  const canChangeRole =
    managesTarget && offeredRoles.some((role) => role !== currentRole)
  const canRemove = managesTarget || member.isSelf

  function describeRoleChange(role: MemberRole) {
    const values = { role, name: member.name, organization: organization.name }

    if (member.isSelf) {
      return {
        title: t("memberActions.roleChange.self.title"),
        description: t("memberActions.roleChange.self.description", values),
        action: t("memberActions.roleChange.self.action"),
      }
    }

    if (role === "owner") {
      return {
        title: t("memberActions.roleChange.promote.title", values),
        description: t("memberActions.roleChange.promote.description", values),
        action: t("memberActions.roleChange.promote.action"),
      }
    }

    return {
      title: t("memberActions.roleChange.demote.title", values),
      description: t("memberActions.roleChange.demote.description", values),
      action: t("memberActions.roleChange.demote.action"),
    }
  }

  const roleCopy = roleChange && describeRoleChange(roleChange.role)

  function changeRole(role: MemberRole) {
    if (role === currentRole) return

    // Ownership and your own role are the two changes the actor cannot simply
    // click back, so those are the ones worth asking about.
    if (role === "owner" || isOwner || member.isSelf) {
      setRoleChange({ role, open: true })
      return
    }

    submitRoleChange(role)
  }

  function submitRoleChange(role: MemberRole) {
    startTransition(async () => {
      const result = await setMemberRole(organization.id, member.userId, role)
      // Nothing in the dialog can fix a refusal, so it closes either way and
      // the toast carries the reason.
      setRoleChange((current) => current && { ...current, open: false })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(
        member.isSelf
          ? t("memberActions.roleChanged.self", {
              role,
              organization: organization.name,
            })
          : t("memberActions.roleChanged.other", { role, name: member.name })
      )
    })
  }

  function submitRemoval() {
    startTransition(async () => {
      const result = await removeMember(organization.id, member.userId)
      // Nothing in the dialog can fix a refusal, so it closes either way and
      // the toast carries the reason.
      setIsRemoving(false)

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(
        member.isSelf
          ? t("memberActions.removed.self", { organization: organization.name })
          : t("memberActions.removed.other", {
              name: member.name,
              organization: organization.name,
            })
      )
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
              aria-label={t("people.actionsFor", { name: member.name })}
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
              copyToClipboard(member.email, t("people.emailAddress"))
            }
          >
            <Copy />
            {t("people.copyEmailAddress")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => copyToClipboard(member.userId, t("people.userId"))}
          >
            <Hash />
            {t("people.copyUserId")}
          </DropdownMenuItem>
          {capabilities.canManageMembers && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger
                  disabled={!canChangeRole}
                  className="data-disabled:pointer-events-none data-disabled:opacity-50"
                >
                  <UserCog />
                  {t("memberActions.changeRole")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-40">
                  <DropdownMenuRadioGroup
                    value={currentRole}
                    onValueChange={(role) => changeRole(role as MemberRole)}
                  >
                    {offeredRoles.map((role) => {
                      const display = MEMBER_ROLE_DISPLAY[role]
                      const RoleIcon = display.icon

                      return (
                        <DropdownMenuRadioItem
                          key={role}
                          value={role}
                          closeOnClick
                          disabled={isPending}
                        >
                          <RoleIcon />
                          {t(`roles.${role}.label`)}
                        </DropdownMenuRadioItem>
                      )
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {capabilities.canManageApplicationRoles && (
                <>
                  <DropdownMenuItem onClick={() => setIsAssigningRoles(true)}>
                    <KeyRound />
                    {t("memberActions.manageApplicationRoles")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsAssigningGroups(true)}>
                    <Network />
                    {t("memberActions.manageGroups")}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
          {(capabilities.canManageMembers || member.isSelf) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!canRemove}
                onClick={() => setIsRemoving(true)}
              >
                <UserMinus />
                {member.isSelf
                  ? t("memberActions.leave")
                  : t("memberActions.remove")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {capabilities.canManageApplicationRoles && (
        <>
          <MemberRolesDialog
            organizationId={organization.id}
            organizationSlug={organization.slug}
            member={member}
            heldRoles={member.applicationRoles}
            roles={applicationRoles}
            open={isAssigningRoles}
            onOpenChange={setIsAssigningRoles}
          />
          <MemberGroupsDialog
            organizationId={organization.id}
            member={member}
            memberGroups={member.groups}
            groups={groups}
            open={isAssigningGroups}
            onOpenChange={setIsAssigningGroups}
          />
        </>
      )}

      <Dialog
        open={isRemoving}
        onOpenChange={(open) => {
          if (!open) setIsRemoving(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {member.isSelf
                ? t("memberActions.leaveDialog.title")
                : t("memberActions.removeDialog.title")}
            </DialogTitle>
            <DialogDescription>
              {member.isSelf
                ? t("memberActions.leaveDialog.description", {
                    organization: organization.name,
                  })
                : t("memberActions.removeDialog.description", {
                    name: member.name,
                    organization: organization.name,
                  })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={isPending} />}
            >
              {tCommon("actions.cancel")}
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={submitRemoval}
            >
              {isPending
                ? member.isSelf
                  ? t("memberActions.leaving")
                  : t("memberActions.removing")
                : member.isSelf
                  ? t("memberActions.leave")
                  : t("memberActions.remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {roleChange && roleCopy && (
        <Dialog
          open={roleChange.open}
          onOpenChange={(open) => {
            if (!open) setRoleChange({ ...roleChange, open: false })
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{roleCopy.title}</DialogTitle>
              <DialogDescription>{roleCopy.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" disabled={isPending} />}
              >
                {tCommon("actions.cancel")}
              </DialogClose>
              <Button
                disabled={isPending}
                onClick={() => submitRoleChange(roleChange.role)}
              >
                {isPending ? t("memberActions.changing") : roleCopy.action}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
