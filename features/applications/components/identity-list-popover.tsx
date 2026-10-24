"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"

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

const MAX_VISIBLE = 6

// The trigger stays one compact cluster however long the list is.
const MAX_AVATARS = 4

export type IdentityListEntry = {
  id: string
  name: string
  secondary?: string | null
  image?: string | null
}

type IdentityListPopoverProps = {
  title: string
  count: number
  // The count in words, such as "3 members", already translated.
  countLabel: string
  // Replaces the plain count under the title, such as to break it down.
  description?: string
  preview: IdentityListEntry[]
  // Omitted when the whole list is already in hand, which is the case wherever
  // the row itself could carry it without a second query.
  load?: () => Promise<
    | { success: true; data: IdentityListEntry[] }
    | { success: false; error: string }
  >
}

export function IdentityListPopover({
  title,
  count,
  countLabel,
  description,
  preview,
  load,
}: IdentityListPopoverProps) {
  const t = useTranslations("applications.lists")
  const tCommon = useTranslations("common")
  const [loaded, setLoaded] = useState<IdentityListEntry[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const items = load ? loaded : preview

  if (count === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        {tCommon("states.none")}
      </span>
    )
  }

  async function loadItems() {
    if (!load) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await load()
      if (result.success) setLoaded(result.data)
      else setError(result.error)
    } catch {
      setError(t("loadFailed", { title }))
    } finally {
      setIsLoading(false)
    }
  }

  const list = items?.map((item) => (
    <div key={item.id} className="flex items-center gap-3 p-2">
      <IdentityLabel
        name={item.name}
        secondary={item.secondary ?? undefined}
        avatar={{ seed: item.id, logo: item.image }}
      />
    </div>
  ))

  const skeleton = (
    <div aria-label={tCommon("states.loading")}>
      {Array.from({ length: Math.min(count, MAX_VISIBLE) }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 p-2">
          <Skeleton className="size-8 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && items === null && !isLoading) void loadItems()
      }}
    >
      <PopoverTrigger
        className="flex h-8 items-center gap-2"
        aria-label={tCommon("keyed.view", { label: description ?? countLabel })}
      >
        <IdentityAvatarGroup
          items={preview.slice(0, MAX_AVATARS).map((item) => ({
            id: item.id,
            name: item.name,
            image: item.image,
          }))}
          total={count}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <PopoverHeader className="p-2">
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description ?? countLabel}</PopoverDescription>
        </PopoverHeader>
        <Separator />
        {isLoading && items === null ? (
          skeleton
        ) : error ? (
          <div className="flex flex-col items-start gap-2 p-2 text-sm">
            <span className="text-destructive">{error}</span>
            <Button variant="outline" size="sm" onClick={loadItems}>
              {tCommon("actions.retry")}
            </Button>
          </div>
        ) : items && items.length > MAX_VISIBLE ? (
          // Only inset the rows when the scrollbar is actually there.
          <ScrollArea className="group/list h-72">
            <div className="group-data-has-overflow-y/list:pr-2.5">{list}</div>
          </ScrollArea>
        ) : (
          list
        )}
      </PopoverContent>
    </Popover>
  )
}
