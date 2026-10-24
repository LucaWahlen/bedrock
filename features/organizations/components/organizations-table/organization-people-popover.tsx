"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

import { getOrganizationPeople } from "@/features/organizations/actions/get-organization-people"
import { RoleBadges } from "@/features/organizations/components/people-table/role-badges"
import type {
  OrganizationPeopleEntry,
  OrganizationPeopleKind,
  OrganizationPerson,
} from "@/features/organizations/types"
import { IdentityAvatarGroup } from "@/features/shared/components/identity-avatar-group"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { Button } from "@/features/shared/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/features/shared/components/ui/popover"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { Separator } from "@/features/shared/components/ui/separator"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

const MAX_VISIBLE_PEOPLE = 6

type OrganizationPeoplePopoverProps = {
  organizationId: string
  kind: OrganizationPeopleKind
  count: number
  preview: OrganizationPerson[]
}

export function OrganizationPeoplePopover({
  organizationId,
  kind,
  count,
  preview,
}: OrganizationPeoplePopoverProps) {
  const t = useTranslations("organizations")
  const tCommon = useTranslations("common")
  const [people, setPeople] = useState<OrganizationPeopleEntry[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (count === 0) {
    return <span className="text-muted-foreground">{t("none")}</span>
  }

  const administrators = kind === "administrators"

  async function loadPeople() {
    setIsLoading(true)
    setError(null)

    try {
      const result = await getOrganizationPeople(organizationId, kind)

      if (result.success) setPeople(result.data)
      else setError(result.error)
    } catch {
      setError(t(`organizationsTable.people.${kind}.loadFailed`))
    } finally {
      setIsLoading(false)
    }
  }

  const peopleList = people?.map((person) => (
    <div
      key={person.id}
      className="flex items-center justify-between gap-3 p-2"
    >
      <IdentityLabel
        name={person.name}
        secondary={person.email}
        avatar={{ seed: person.id, logo: person.image }}
      />
      {/* Every member would say "Member", so roles only earn their place where
          the list mixes them. */}
      {administrators && <RoleBadges roles={person.roles} />}
    </div>
  ))
  const skeletonList = (
    <div aria-label={t(`organizationsTable.people.${kind}.loading`)}>
      {Array.from({ length: Math.min(count, MAX_VISIBLE_PEOPLE) }).map(
        (_, index) => (
          <div key={index} className="flex items-center gap-2 p-2">
            <Skeleton className="size-8 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        )
      )}
    </div>
  )

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && people === null && !isLoading) void loadPeople()
      }}
    >
      <PopoverTrigger
        className="flex h-8 items-center"
        aria-label={t(`organizationsTable.people.${kind}.view`, { count })}
      >
        <IdentityAvatarGroup
          items={preview.map((person) => ({
            id: person.id,
            name: person.name,
            image: person.image,
          }))}
          total={count}
        />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <PopoverHeader className="p-2">
          <PopoverTitle>
            {t(`organizationsTable.people.${kind}.title`)}
          </PopoverTitle>
          <PopoverDescription>
            {t(`organizationsTable.people.${kind}.count`, { count })}
          </PopoverDescription>
        </PopoverHeader>
        <Separator />
        {isLoading && people === null ? (
          skeletonList
        ) : error ? (
          <div className="flex flex-col items-start gap-2 p-2 text-sm">
            <span className="text-destructive">{error}</span>
            <Button variant="outline" size="sm" onClick={loadPeople}>
              {tCommon("actions.retry")}
            </Button>
          </div>
        ) : people && people.length > MAX_VISIBLE_PEOPLE ? (
          // Only inset the rows when the scrollbar is actually there.
          <ScrollArea className="group/people h-72">
            <div className="group-data-has-overflow-y/people:pr-2.5">
              {peopleList}
            </div>
          </ScrollArea>
        ) : (
          peopleList
        )}
      </PopoverContent>
    </Popover>
  )
}
