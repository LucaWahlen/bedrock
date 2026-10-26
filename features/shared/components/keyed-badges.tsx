"use client"

import { UsersRound } from "lucide-react"
import { useTranslations } from "next-intl"

import { badgeVariants } from "@/features/shared/components/ui/badge"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/features/shared/components/ui/tooltip"
import { cn } from "@/features/shared/lib/ui/utils"

const MAX_BADGES = 2

// Every value a cell lists looks the same, whether it is a role, a group or
// anything else, so colour is left to the state columns beside it.
const VALUE_BADGE_CLASS = cn(badgeVariants({ variant: "outline" }), "max-w-32")
const OVERFLOW_BADGE_CLASS = cn(
  badgeVariants({ variant: "outline" }),
  "text-muted-foreground tabular-nums"
)

// Anything an organization names with a stable key, as a table cell lists it.
export type KeyedBadge = {
  id: string
  key: string
  name: string
  // Held through something else, such as a role granted by a group, rather
  // than given outright. Marked with a group icon; the note says which.
  inherited?: boolean
  // Where it comes from, when that is worth saying.
  note?: string | null
}

type KeyedBadgesProps = {
  items: KeyedBadge[]
  title: string
  singularLabel: string
  pluralLabel: string
}

function InheritedIcon({ className }: { className?: string }) {
  return (
    <UsersRound
      data-icon="inline-start"
      aria-hidden="true"
      className={cn("shrink-0 text-muted-foreground", className)}
    />
  )
}

function NameBadge({ item }: { item: KeyedBadge }) {
  const content = (
    <>
      {item.inherited && <InheritedIcon />}
      <span className="truncate">{item.name}</span>
    </>
  )

  if (!item.note) {
    return (
      <span className={VALUE_BADGE_CLASS} title={item.name}>
        {content}
      </span>
    )
  }

  // A span rather than the tooltip's own button, since the badges already sit
  // inside the popover trigger and a button cannot hold another.
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={VALUE_BADGE_CLASS} />}>
        {content}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span className="font-medium">{item.name}</span>
        <span>{item.note}</span>
      </TooltipContent>
    </Tooltip>
  )
}

export function KeyedBadges({
  items,
  title,
  singularLabel,
  pluralLabel,
}: KeyedBadgesProps) {
  const t = useTranslations("common")

  if (items.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">{t("states.none")}</span>
    )
  }

  const shown = items.slice(0, MAX_BADGES)
  const remaining = items.length - shown.length
  const label = t("keyed.count", {
    count: items.length,
    label: items.length === 1 ? singularLabel : pluralLabel,
  })

  return (
    <Popover>
      <PopoverTrigger
        className="flex h-8 max-w-full items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={t("keyed.view", { label })}
      >
        {shown.map((item) => (
          <NameBadge key={item.id} item={item} />
        ))}
        {remaining > 0 && (
          <span className={OVERFLOW_BADGE_CLASS}>+{remaining}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 p-0">
        <PopoverHeader className="p-2">
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{label}</PopoverDescription>
        </PopoverHeader>
        <Separator />
        <ScrollArea className="group/names *:data-[slot=scroll-area-viewport]:max-h-72">
          <ul className="p-1 group-data-has-overflow-y/names:pr-2.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.inherited && <InheritedIcon className="size-3.5" />}
                    <span className="truncate">{item.name}</span>
                  </span>
                  {item.note && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {item.key}
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
