"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { setMemberGroups } from "@/features/groups/actions/set-member-groups"
import type { GroupOption, GroupSummary } from "@/features/groups/types"
import { KeyedChecklist } from "@/features/shared/components/keyed-checklist"
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

type MemberGroupsDialogProps = {
  organizationId: string
  member: { userId: string; name: string }
  memberGroups: GroupSummary[]
  groups: GroupOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MemberGroupsDialog({
  organizationId,
  member,
  memberGroups,
  groups,
  open,
  onOpenChange,
}: MemberGroupsDialogProps) {
  const joined = memberGroups.map((held) => held.id)
  const [selected, setSelected] = useState(joined)
  const [wasOpen, setWasOpen] = useState(open)
  const [isPending, startTransition] = useTransition()

  // Each opening starts from the groups the member is in now, not a draft left
  // behind.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelected(joined)
  }

  // What joining grants is the point of a group, so it is said beside each one.
  const options = groups.map((option) => ({
    id: option.id,
    key: option.key,
    name: option.name,
    note:
      option.roles.length > 0
        ? `Grants ${option.roles.map((role) => role.name).join(", ")}`
        : "Grants no roles",
  }))

  function save() {
    startTransition(async () => {
      const result = await setMemberGroups({
        organizationId,
        userId: member.userId,
        groupIds: selected,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      onOpenChange(false)
      toast.success(`Groups for ${member.name} were saved`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Groups</DialogTitle>
          <DialogDescription>
            Choose the groups {member.name} is in. {member.name} holds every
            role a group grants, in addition to any given directly.
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <FieldDescription>
            This organization has no groups yet. Create one on the Groups page.
          </FieldDescription>
        ) : (
          <KeyedChecklist
            id="member-groups"
            label="Groups"
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
            Cancel
          </DialogClose>
          <Button disabled={isPending || groups.length === 0} onClick={save}>
            {isPending ? "Saving..." : "Save groups"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
