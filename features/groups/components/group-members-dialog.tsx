"use client"

import { useTranslations } from "next-intl"
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

function code(chunks: React.ReactNode) {
  return <span className="font-mono text-xs">{chunks}</span>
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
  const t = useTranslations("groups")
  const tCommon = useTranslations("common")
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
        const people = result.data.map((person): PersonSelection => ({
          kind: "user",
          ...person,
        }))
        setCurrent(people)
        setSelected(people)
      })
      .catch(() => {
        if (active) setError(t("groupMembers.loadFailed"))
      })

    return () => {
      active = false
    }
  }, [open, organizationId, group.id, t])

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
      toast.success(t("groupMembers.saved", { name: group.name }))
    })
  }

  const loading = current === null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("groupMembers.title", { name: group.name })}
          </DialogTitle>
          <DialogDescription>
            {t.rich("groupMembers.description", { key: group.key, code })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Field data-invalid={error !== null}>
            <FieldLabel htmlFor="group-members-picker">
              {t("groupMembers.label")}
            </FieldLabel>
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
                {t("groupMembers.showing", {
                  shown: current.length,
                  total: group.memberCount,
                })}
              </FieldDescription>
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            {tCommon("actions.cancel")}
          </DialogClose>
          <Button disabled={isPending || loading} onClick={save}>
            {isPending ? tCommon("states.saving") : t("groupMembers.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
