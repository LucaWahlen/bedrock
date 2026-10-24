"use client"

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
      toast.success(`Roles of ${group.name} were saved`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Roles of {group.name}</DialogTitle>
          <DialogDescription>
            Everyone in {group.name} holds these roles, in addition to any they
            were given directly.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field>
            <FieldLabel htmlFor="group-roles-picker">Roles</FieldLabel>
            <KeyedOptionPicker
              id="group-roles-picker"
              options={roles}
              value={selected}
              onChange={setSelected}
              disabled={isPending || roles.length === 0}
              placeholder="Search roles..."
              noneMessage="Define a role on the Roles page first."
              allTakenMessage="Every role is already granted."
              noMatchMessage="No role matches that."
            />
            {roles.length === 0 && (
              <FieldDescription>
                This organization has no roles yet. Define one on the Roles
                page.
              </FieldDescription>
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            Cancel
          </DialogClose>
          <Button disabled={isPending || roles.length === 0} onClick={save}>
            {isPending ? "Saving..." : "Save roles"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
