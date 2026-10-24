"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { findGroupCandidates } from "@/features/groups/actions/find-group-candidates"
import { getGroupMembers } from "@/features/groups/actions/get-group-members"
import { setGroupMembers } from "@/features/groups/actions/set-group-members"
import type { Group } from "@/features/groups/types"
import { UserPicker, type PersonSelection } from "@/features/organizations"
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
  FieldError,
  FieldLabel,
} from "@/features/shared/components/ui/field"

type GroupMembersDialogProps = {
  organizationId: string
  group: Group
  open: boolean
  onOpenChange: (open: boolean) => void
}

function userIdsOf(people: PersonSelection[]) {
  return people.flatMap((person) => (person.kind === "user" ? [person.id] : []))
}

export function GroupMembersDialog({
  organizationId,
  group,
  open,
  onOpenChange,
}: GroupMembersDialogProps) {
  const [current, setCurrent] = useState<PersonSelection[] | null>(null)
  const [selected, setSelected] = useState<PersonSelection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Each opening starts from who is in the group now, not a draft left behind.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCurrent(null)
      setSelected([])
      setError(null)
    }
  }

  useEffect(() => {
    if (!open) return

    let active = true

    getGroupMembers(organizationId, group.id)
      .then((result) => {
        if (!active) return
        if (!result.success) {
          setError(result.error)
          return
        }
        const people = result.data.map(
          (person): PersonSelection => ({ kind: "user", ...person })
        )
        setCurrent(people)
        setSelected(people)
      })
      .catch(() => {
        if (active) setError("Members could not be loaded")
      })

    return () => {
      active = false
    }
  }, [open, organizationId, group.id])

  function save() {
    if (!current) return

    const before = new Set(userIdsOf(current))
    const after = new Set(userIdsOf(selected))

    startTransition(async () => {
      const result = await setGroupMembers({
        organizationId,
        groupId: group.id,
        add: [...after].filter((userId) => !before.has(userId)),
        remove: [...before].filter((userId) => !after.has(userId)),
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      onOpenChange(false)
      toast.success(`Members of ${group.name} were saved`)
    })
  }

  const loading = current === null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Members of {group.name}</DialogTitle>
          <DialogDescription>
            Applications that ask for groups receive{" "}
            <span className="font-mono text-xs">{group.key}</span> for these
            people, along with every role the group grants.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor="group-members-picker">Members</FieldLabel>
            {/* Rendered at once and filled in when loaded, so nothing jumps. */}
            <UserPicker
              id="group-members-picker"
              value={selected}
              onChange={setSelected}
              organizationId={organizationId}
              canSearchDirectory
              lookup={findGroupCandidates}
              disabled={isPending || loading || error !== null}
            />
            {error && <FieldError>{error}</FieldError>}
            {current && group.memberCount > current.length && (
              <FieldDescription>
                Showing {current.length} of {group.memberCount}. The others stay
                in the group.
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
          <Button disabled={isPending || loading} onClick={save}>
            {isPending ? "Saving..." : "Save members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
