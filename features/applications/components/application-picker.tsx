"use client"

import { Combobox } from "@base-ui/react/combobox"
import { Check, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import type { ApplicationSummary } from "@/features/applications/types"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { cn } from "@/features/shared/lib/ui/utils"

type ApplicationPickerProps = {
  id: string
  applications: ApplicationSummary[]
  value: string[]
  onChange: (clientIds: string[]) => void
  disabled?: boolean
  invalid?: boolean
}

// The organization's own applications are already in hand, so unlike the people
// picker this one filters locally rather than asking the server on every key.
export function ApplicationPicker({
  id,
  applications,
  value,
  onChange,
  disabled,
  invalid,
}: ApplicationPickerProps) {
  const t = useTranslations("applications.applicationPicker")
  const [query, setQuery] = useState("")

  const byId = new Map(
    applications.map((application) => [application.clientId, application])
  )
  const selected = value.flatMap((clientId) => byId.get(clientId) ?? [])
  const taken = new Set(value)
  const term = query.trim().toLowerCase()
  const items = applications.filter(
    (application) =>
      !taken.has(application.clientId) &&
      (!term || application.name.toLowerCase().includes(term))
  )

  return (
    <Combobox.Root
      items={items}
      value={selected}
      multiple
      disabled={disabled}
      filter={null}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next: ApplicationSummary[]) =>
        onChange(next.map((application) => application.clientId))
      }
      itemToStringLabel={(application: ApplicationSummary) => application.name}
      isItemEqualToValue={(
        application: ApplicationSummary,
        other: ApplicationSummary
      ) => application.clientId === other.clientId}
    >
      <Combobox.InputGroup
        className={cn(
          "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border bg-transparent px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          invalid && "border-destructive ring-destructive/20",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <Combobox.Chips className="flex w-full flex-wrap items-center gap-1">
          <Combobox.Value>
            {(chosen: ApplicationSummary[]) => (
              <>
                {chosen.map((application) => (
                  <Combobox.Chip
                    key={application.clientId}
                    className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-0.5 pl-1 text-xs outline-none focus-within:ring-2 focus-within:ring-ring/50 data-highlighted:ring-2 data-highlighted:ring-ring/50"
                    aria-label={application.name}
                  >
                    <IdentityAvatar
                      seed={application.clientId}
                      logo={application.icon}
                      name={application.name}
                      variant="sm"
                    />
                    <span className="max-w-40 truncate">
                      {application.name}
                    </span>
                    <Combobox.ChipRemove
                      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={t("remove", { name: application.name })}
                    >
                      <X className="size-3" />
                    </Combobox.ChipRemove>
                  </Combobox.Chip>
                ))}
                <Combobox.Input
                  id={id}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={invalid}
                  placeholder={chosen.length ? "" : t("placeholder")}
                  className="h-7 min-w-32 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
                />
              </>
            )}
          </Combobox.Value>
        </Combobox.Chips>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner className="z-50 outline-none" sideOffset={4}>
          <Combobox.Popup className="w-(--anchor-width) origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-[transform,scale,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {/* Base UI keeps this mounted and empties it once there are items. */}
            <Combobox.Empty className="px-2 py-3 text-center text-sm text-muted-foreground empty:hidden">
              {applications.length === 0 ? t("none") : t("noMatch")}
            </Combobox.Empty>
            <ScrollArea className="group/apps *:data-[slot=scroll-area-viewport]:max-h-64">
              {/* Only inset the items when the scrollbar is actually there. */}
              <Combobox.List className="group-data-has-overflow-y/apps:pr-2.5">
                {(application: ApplicationSummary) => (
                  <Combobox.Item
                    key={application.clientId}
                    value={application}
                    className="flex cursor-default items-center justify-between gap-2 rounded-md p-1.5 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <IdentityLabel
                      name={application.name}
                      secondary={application.clientId}
                      avatar={{
                        seed: application.clientId,
                        logo: application.icon,
                      }}
                    />
                    <Combobox.ItemIndicator>
                      <Check className="size-4" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </ScrollArea>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
