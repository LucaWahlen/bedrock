"use client"

import { useFormatter, useTranslations } from "next-intl"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { addPeople } from "@/features/organizations/actions/add-people"
import { RoleCards } from "@/features/organizations/components/people-table/role-cards"
import { UserPicker } from "@/features/organizations/components/user-picker"
import {
  MEMBER_ROLES,
  ROOT_MEMBER_ROLES,
  type MemberCapabilities,
  type MemberRole,
  type Organization,
  type PersonSelection,
} from "@/features/organizations/types"
import { Button } from "@/features/shared/components/ui/button"
import { Checkbox } from "@/features/shared/components/ui/checkbox"
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
import { Field, FieldLabel } from "@/features/shared/components/ui/field"

type AddPeopleDialogProps = {
  organization: Organization
  capabilities: MemberCapabilities
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddPeopleDialog({
  organization,
  capabilities,
  open,
  onOpenChange,
}: AddPeopleDialogProps) {
  const t = useTranslations("organizations.addPeople")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const assignableRoles = organization.isRoot ? ROOT_MEMBER_ROLES : MEMBER_ROLES
  const defaultRole: MemberRole = organization.isRoot ? "admin" : "member"
  const [people, setPeople] = useState<PersonSelection[]>([])
  const [role, setRole] = useState<MemberRole>(defaultRole)
  const [invite, setInvite] = useState(true)
  const [isPending, startTransition] = useTransition()

  const selectedUserIds = people.flatMap((person) =>
    person.kind === "user" ? [person.id] : []
  )
  const selectedEmails = people.map((person) => person.email)
  // Nobody exists to add, so the choice is not the administrator's to make.
  const mustInvite = people.some((person) => person.kind === "address")
  const invites = invite || mustInvite

  function close() {
    setPeople([])
    setRole(defaultRole)
    setInvite(true)
    onOpenChange(false)
  }

  function submit() {
    if (people.length === 0) return

    startTransition(async () => {
      const result = await addPeople({
        organizationId: organization.id,
        userIds: invites ? [] : selectedUserIds,
        emails: invites ? selectedEmails : [],
        role,
        invite: invites,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      const count = result.invited + result.added
      const outcome = result.invited > 0 ? "invited" : "added"
      const values = { count, organization: organization.name }
      const notes = [
        ...(result.refused.length > 0
          ? [t("notes.refused", { count: result.refused.length })]
          : []),
        ...(result.undelivered > 0
          ? [t("notes.undelivered", { count: result.undelivered })]
          : []),
        ...(result.skipped > 0
          ? [t("notes.skipped", { count: result.skipped })]
          : []),
      ]

      toast.success(
        count === 1 && people.length === 1
          ? t(`${outcome}.one`, {
              ...values,
              name:
                people[0].kind === "user" ? people[0].name : people[0].email,
            })
          : t(`${outcome}.many`, values),
        {
          description:
            result.refused.length > 0
              ? result.refused[0]
              : notes.length > 0
                ? t("notes.summary", {
                    notes: format.list(notes, { type: "unit" }),
                  })
                : undefined,
        }
      )
      close()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {capabilities.canSearchDirectory
              ? t("descriptionWithDirectory", {
                  organization: organization.name,
                })
              : t("descriptionByAddress", { organization: organization.name })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="add-people-recipients">
                {t("people")}
              </FieldLabel>
              <UserPicker
                id="add-people-recipients"
                value={people}
                onChange={setPeople}
                organizationId={organization.id}
                canSearchDirectory={capabilities.canSearchDirectory}
                invitable={t("inviteTo", { organization: organization.name })}
                disabled={isPending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-people-role">{t("role")}</FieldLabel>
              <RoleCards
                id="add-people-role"
                value={role}
                onChange={setRole}
                roles={
                  capabilities.canManageOwners
                    ? assignableRoles
                    : assignableRoles.filter(
                        (assignable) => assignable !== "owner"
                      )
                }
                disabled={isPending}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="add-people-invite"
                checked={invites}
                disabled={isPending || mustInvite}
                onCheckedChange={(checked) => setInvite(checked === true)}
              />
              <FieldLabel
                htmlFor="add-people-invite"
                title={mustInvite ? t("mustInvite") : undefined}
              >
                {t("sendInvitation")}
              </FieldLabel>
            </Field>
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            {tCommon("actions.cancel")}
          </DialogClose>
          <Button disabled={isPending || people.length === 0} onClick={submit}>
            {isPending
              ? invites
                ? t("sending")
                : t("adding")
              : invites
                ? t("submitInvite")
                : t("submitAdd")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
