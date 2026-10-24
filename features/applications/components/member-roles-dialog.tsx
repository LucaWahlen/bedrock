"use client"

import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setMemberRoles } from "@/features/applications/actions/set-member-roles"
import type {
  ApplicationRoleOption,
  HeldApplicationRole,
  RoleGroupSummary,
} from "@/features/applications/types"
import {
  KeyedChecklist,
  type KeyedChecklistOption,
} from "@/features/shared/components/keyed-checklist"
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
import { FieldDescription } from "@/features/shared/components/ui/field"

type MemberRolesDialogProps = {
  organizationId: string
  organizationSlug: string
  member: { userId: string; name: string }
  // Every role the member holds, and how.
  heldRoles: HeldApplicationRole[]
  roles: ApplicationRoleOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GroupLinks({
  organizationSlug,
  groups,
}: {
  organizationSlug: string
  groups: RoleGroupSummary[]
}) {
  const format = useFormatter()

  return format.list(
    groups.map((granting) => (
      <Link
        key={granting.id}
        href={`/org/${organizationSlug}/groups?search=${encodeURIComponent(granting.key)}`}
      >
        {granting.name}
      </Link>
    ))
  )
}

export function MemberRolesDialog({
  organizationId,
  organizationSlug,
  member,
  heldRoles,
  roles,
  open,
  onOpenChange,
}: MemberRolesDialogProps) {
  const t = useTranslations("applications.memberRoles")
  const tCommon = useTranslations("common")
  const assignedRoleIds = heldRoles
    .filter((role) => role.direct)
    .map((role) => role.id)
  const [selected, setSelected] = useState(assignedRoleIds)
  const [wasOpen, setWasOpen] = useState(open)
  const [isPending, startTransition] = useTransition()
  const heldById = new Map(heldRoles.map((role) => [role.id, role]))

  // Each opening starts from what the member holds now, not a draft left behind.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelected(assignedRoleIds)
  }

  // Only a direct assignment is this dialog's to change. A role a group grants
  // stays held whatever is ticked here, so it is shown held and locked, with
  // the group to change instead.
  const options = roles.map((role): KeyedChecklistOption => {
    const held = heldById.get(role.id)
    const groups = held?.groups ?? []
    const links = (
      <GroupLinks organizationSlug={organizationSlug} groups={groups} />
    )

    if (groups.length === 0) return role

    return held?.direct
      ? { ...role, note: t.rich("alsoVia", { groups: () => links }) }
      : { ...role, locked: true, note: t.rich("via", { groups: () => links }) }
  })

  function save() {
    startTransition(async () => {
      const result = await setMemberRoles({
        organizationId,
        userId: member.userId,
        roleIds: selected,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      onOpenChange(false)
      toast.success(t("saved", { name: member.name }))
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: member.name })}
          </DialogDescription>
        </DialogHeader>

        {roles.length === 0 ? (
          <FieldDescription>{t("noRoles")}</FieldDescription>
        ) : (
          <KeyedChecklist
            id="member-application-roles"
            label={t("label")}
            options={options}
            value={selected}
            onChange={setSelected}
            disabled={isPending}
          />
        )}

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            {tCommon("actions.cancel")}
          </DialogClose>
          <Button disabled={isPending || roles.length === 0} onClick={save}>
            {isPending ? tCommon("states.saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
