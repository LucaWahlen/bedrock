"use client"

import { useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setRoleGroups } from "@/features/applications/actions/set-role-groups"
import type {
  ApplicationRole,
  RoleGroupOption,
} from "@/features/applications/types"
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

// A tag renderer for `t.rich`, built outside the component.
function code(chunks: React.ReactNode) {
  return <span className="font-mono text-xs">{chunks}</span>
}

type RoleGroupsDialogProps = {
  organizationId: string
  role: ApplicationRole
  groups: RoleGroupOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleGroupsDialog({
  organizationId,
  role,
  groups,
  open,
  onOpenChange,
}: RoleGroupsDialogProps) {
  const t = useTranslations("applications.roleGroups")
  const tCommon = useTranslations("common")
  const granting = role.groups.map((group) => group.id)
  const [selected, setSelected] = useState(granting)
  const [wasOpen, setWasOpen] = useState(open)
  const [isPending, startTransition] = useTransition()

  // Each opening starts from the groups granting it now, not a draft left behind.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelected(granting)
  }

  function save() {
    startTransition(async () => {
      const result = await setRoleGroups({
        organizationId,
        roleId: role.id,
        groupIds: selected,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      onOpenChange(false)
      toast.success(t("saved", { name: role.name }))
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name: role.name })}</DialogTitle>
          <DialogDescription>
            {t.rich("description", { key: role.key, code })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field>
            <FieldLabel htmlFor="role-groups-picker">{t("label")}</FieldLabel>
            <KeyedOptionPicker
              id="role-groups-picker"
              options={groups}
              value={selected}
              onChange={setSelected}
              disabled={isPending || groups.length === 0}
              placeholder={t("placeholder")}
              noneMessage={t("none")}
              allTakenMessage={t("allTaken")}
              noMatchMessage={t("noMatch")}
            />
            {groups.length === 0 && (
              <FieldDescription>{t("noGroups")}</FieldDescription>
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            {tCommon("actions.cancel")}
          </DialogClose>
          <Button disabled={isPending || groups.length === 0} onClick={save}>
            {isPending ? tCommon("states.saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
