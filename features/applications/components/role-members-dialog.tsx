"use client"

import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { findRoleCandidates } from "@/features/applications/actions/find-role-candidates"
import { getRoleMembers } from "@/features/applications/actions/get-role-members"
import { setRoleMembers } from "@/features/applications/actions/set-role-members"
import type { ApplicationRole, RoleHolder } from "@/features/applications/types"
import { UserPicker, type PersonSelection } from "@/features/organizations"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
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
  FieldTitle,
} from "@/features/shared/components/ui/field"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

// Rows of the read-only list shown before it scrolls, and drawn as skeletons
// while it loads, so the dialog keeps its size when the list arrives.
const VISIBLE_INHERITED = 4

type RoleMembersDialogProps = {
  organizationId: string
  organizationSlug: string
  role: ApplicationRole
  open: boolean
  onOpenChange: (open: boolean) => void
}

// A tag renderer for `t.rich`, built outside the component.
function code(chunks: React.ReactNode) {
  return <span className="font-mono text-xs">{chunks}</span>
}

function userIdsOf(people: PersonSelection[]) {
  return people.flatMap((person) => (person.kind === "user" ? [person.id] : []))
}

function InheritedHolder({
  holder,
  organizationSlug,
}: {
  holder: RoleHolder
  organizationSlug: string
}) {
  const t = useTranslations("applications.roleMembers")
  const format = useFormatter()
  const links = format.list(
    holder.groups.map((granting) => (
      <Link
        key={granting.id}
        href={`/org/${organizationSlug}/groups?search=${encodeURIComponent(granting.key)}`}
      >
        {granting.name}
      </Link>
    ))
  )

  return (
    <li className="flex h-12 items-center gap-2 px-2">
      <IdentityAvatar
        seed={holder.id}
        logo={holder.image}
        name={holder.name}
        variant="md"
      />
      <div className="min-w-0 text-sm">
        <div className="truncate font-medium">{holder.name}</div>
        <div className="truncate text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground">
          {t.rich(holder.direct ? "viaAndDirect" : "via", {
            groups: () => links,
          })}
        </div>
      </div>
    </li>
  )
}

export function RoleMembersDialog({
  organizationId,
  organizationSlug,
  role,
  open,
  onOpenChange,
}: RoleMembersDialogProps) {
  const t = useTranslations("applications.roleMembers")
  const tCommon = useTranslations("common")
  const [holders, setHolders] = useState<RoleHolder[] | null>(null)
  const [selected, setSelected] = useState<PersonSelection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const direct = holders?.filter((holder) => holder.direct) ?? null
  const inherited =
    holders?.filter((holder) => holder.groups.length > 0) ?? null

  // Each opening starts from who holds the role now, not a draft left behind.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setHolders(null)
      setSelected([])
      setError(null)
    }
  }

  useEffect(() => {
    if (!open) return

    let active = true

    getRoleMembers(organizationId, role.id)
      .then((result) => {
        if (!active) return
        if (!result.success) {
          setError(result.error)
          return
        }
        setHolders(result.data)
        setSelected(
          result.data.flatMap((holder): PersonSelection[] =>
            holder.direct
              ? [
                  {
                    kind: "user",
                    id: holder.id,
                    name: holder.name,
                    email: holder.email,
                    image: holder.image,
                  },
                ]
              : []
          )
        )
      })
      .catch(() => {
        if (active) setError(t("loadFailed"))
      })

    return () => {
      active = false
    }
  }, [open, organizationId, role.id, t])

  function save() {
    if (!direct) return

    // Only direct holders are named, so someone holding the role through a
    // group alone can never be removed from it here.
    const before = new Set(direct.map((holder) => holder.id))
    const after = new Set(userIdsOf(selected))

    startTransition(async () => {
      const result = await setRoleMembers({
        organizationId,
        roleId: role.id,
        add: [...after].filter((userId) => !before.has(userId)),
        remove: [...before].filter((userId) => !after.has(userId)),
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
          <div className="flex flex-col gap-4">
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor="role-members-picker">
                {t("direct")}
              </FieldLabel>
              {error ? (
                <FieldError>{error}</FieldError>
              ) : direct === null ? (
                <Skeleton className="h-9 w-full" aria-label={t("loading")} />
              ) : (
                <UserPicker
                  id="role-members-picker"
                  value={selected}
                  onChange={setSelected}
                  organizationId={organizationId}
                  canSearchDirectory
                  lookup={findRoleCandidates}
                  disabled={isPending}
                />
              )}
              {direct && role.directMemberCount > direct.length && (
                <FieldDescription>
                  {t("showingDirect", {
                    shown: direct.length,
                    total: role.directMemberCount,
                  })}
                </FieldDescription>
              )}
            </Field>

            {role.groupMemberCount > 0 && !error && (
              <div className="flex flex-col gap-2">
                <FieldTitle>{t("throughGroups")}</FieldTitle>
                <ScrollArea className="group/inherited rounded-lg border *:data-[slot=scroll-area-viewport]:max-h-48">
                  <ul
                    className="py-1 group-data-has-overflow-y/inherited:pr-2.5"
                    aria-busy={inherited === null}
                  >
                    {inherited === null
                      ? Array.from({
                          length: Math.min(
                            role.groupMemberCount,
                            VISIBLE_INHERITED
                          ),
                        }).map((_, index) => (
                          <li
                            key={index}
                            className="flex h-12 items-center gap-2 px-2"
                          >
                            <Skeleton className="size-8 shrink-0" />
                            <div className="flex-1 space-y-1.5">
                              <Skeleton className="h-3.5 w-28" />
                              <Skeleton className="h-3 w-40" />
                            </div>
                          </li>
                        ))
                      : inherited.map((holder) => (
                          <InheritedHolder
                            key={holder.id}
                            holder={holder}
                            organizationSlug={organizationSlug}
                          />
                        ))}
                  </ul>
                </ScrollArea>
                <FieldDescription>
                  {inherited && role.groupMemberCount > inherited.length
                    ? `${t("showingInherited", {
                        shown: inherited.length,
                        total: role.groupMemberCount,
                      })} `
                    : ""}
                  {t("inheritedHint")}
                </FieldDescription>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" disabled={isPending} />}
          >
            {tCommon("actions.cancel")}
          </DialogClose>
          <Button disabled={isPending || direct === null} onClick={save}>
            {isPending ? tCommon("states.saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
