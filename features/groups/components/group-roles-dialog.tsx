"use client"

import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import type { ApplicationRoleOption } from "@/features/applications"
import { setGroupRoles } from "@/features/groups/actions/set-group-roles"
import type { Group } from "@/features/groups/types"
import { KeyedOptionPicker } from "@/features/shared/components/keyed-option-picker"
import { Button } from "@/features/shared/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/features/shared/components/ui/field"

type GroupRolesDialogProps = {
  organizationId: string
  group: Group
  roles: ApplicationRoleOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GroupRolesDialog({
  organizationId,
  group,
  roles,
  open,
  onOpenChange,
}: GroupRolesDialogProps) {
  const t = useTranslations("groups")
  const tCommon = useTranslations("common")
  const granted = group.roles.map((role) => role.id)
  const [selected, setSelected] = useState(granted)
  const [wasOpen, setWasOpen] = useState(open)
  const [isPending, startTransition] = useTransition()

  // Each opening starts from what the group grants now, not a draft left behind.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelected(granted)
  }

  function save() {
    startTransition(async () => {
      const result = await setGroupRoles({
        organizationId,
        groupId: group.id,
        roleIds: selected,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      onOpenChange(false)
      toast.success(t("groupRoles.saved", { name: group.name }))
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("groupRoles.title", { name: group.name })}
          </DialogTitle>
          <DialogDescription>
            {t("groupRoles.description", { name: group.name })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field>
            <FieldLabel htmlFor="group-roles-picker">
              {t("groupRoles.label")}
            </FieldLabel>
            <KeyedOptionPicker
              id="group-roles-picker"
              options={roles}
              value={selected}
              onChange={setSelected}
              disabled={isPending || roles.length === 0}
              placeholder={t("rolePicker.placeholder")}
              noneMessage={t("rolePicker.none")}
              allTakenMessage={t("rolePicker.allTaken")}
              noMatchMessage={t("rolePicker.noMatch")}
            />
            {roles.length === 0 && (
              <FieldDescription>{t("groupRoles.noRoles")}</FieldDescription>
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            {tCommon("actions.cancel")}
          </DialogClose>
          <Button disabled={isPending || roles.length === 0} onClick={save}>
            {isPending ? tCommon("states.saving") : t("groupRoles.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
