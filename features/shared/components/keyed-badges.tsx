"use client"

import { useTranslations } from "next-intl"

import { Badge, badgeVariants } from "@/features/shared/components/ui/badge"
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

// Anything an organization names with a stable key, as a table cell lists it.
export type KeyedBadge = {
  id: string
  key: string
  name: string
  // Held through something else, such as a role granted by a group, rather
  // than given outright. Drawn dashed so it reads as borrowed.
  inherited?: boolean
  // Where it comes from, when that is worth saying.
  note?: string | null
}

type KeyedBadgesProps = {
  items: KeyedBadge[]
  title: string
  singularLabel: string
  pluralLabel: string
  // Roles are filled and groups outlined, so the two columns never blur.
  variant: "secondary" | "outline"
}

function NameBadge({
  item,
  variant,
}: {
  item: KeyedBadge
  variant: KeyedBadgesProps["variant"]
}) {
  const className = cn(
    badgeVariants({ variant: item.inherited ? "outline" : variant }),
    "max-w-32",
    item.inherited && "border-dashed text-muted-foreground"
  )
  const name = <span className="truncate">{item.name}</span>

  if (!item.note) return <span className={className}>{name}</span>

  // A span rather than the tooltip's own button, since the badges already sit
  // inside the popover trigger and a button cannot hold another.
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={className} />}>
        {name}
      </TooltipTrigger>
      <TooltipContent>{item.note}</TooltipContent>
    </Tooltip>
  )
}

export function KeyedBadges({
  items,
  title,
  singularLabel,
  pluralLabel,
  variant,
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
        className="flex h-8 items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={t("keyed.view", { label })}
      >
        {shown.map((item) => (
          <NameBadge key={item.id} item={item} variant={variant} />
        ))}
        {remaining > 0 && <Badge variant="outline">+{remaining}</Badge>}
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
                  <span className="block truncate font-medium">
                    {item.name}
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
