"use client"

import { Combobox } from "@base-ui/react/combobox"
import { Check, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { cn } from "@/features/shared/lib/ui/utils"

// Anything an organization names with a stable key, such as a role or a group.
export type KeyedOption = {
  id: string
  key: string
  name: string
  description?: string | null
}

type KeyedOptionPickerProps = {
  id: string
  options: KeyedOption[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
  // Shown when there is nothing to choose from at all.
  noneMessage: string
  allTakenMessage: string
  noMatchMessage: string
  disabled?: boolean
}

export function KeyedOptionPicker({
  id,
  options,
  value,
  onChange,
  placeholder,
  noneMessage,
  allTakenMessage,
  noMatchMessage,
  disabled,
}: KeyedOptionPickerProps) {
  const t = useTranslations("common.keyed")
  const [query, setQuery] = useState("")

  const byId = new Map(options.map((option) => [option.id, option]))
  const selected = value.flatMap((optionId) => byId.get(optionId) ?? [])
  const taken = new Set(value)
  const term = query.trim().toLowerCase()
  const items = options.filter(
    (option) =>
      !taken.has(option.id) &&
      (!term ||
        option.name.toLowerCase().includes(term) ||
        option.key.includes(term))
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
      onValueChange={(next: KeyedOption[]) =>
        onChange(next.map((option) => option.id))
      }
      itemToStringLabel={(option: KeyedOption) => option.name}
      isItemEqualToValue={(option: KeyedOption, other: KeyedOption) =>
        option.id === other.id
      }
    >
      <Combobox.InputGroup
        className={cn(
          "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border bg-transparent px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <Combobox.Chips className="flex w-full flex-wrap items-center gap-1">
          <Combobox.Value>
            {(chosen: KeyedOption[]) => (
              <>
                {chosen.map((option) => (
                  <Combobox.Chip
                    key={option.id}
                    className="flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-0.5 pl-2 text-xs outline-none focus-within:ring-2 focus-within:ring-ring/50 data-highlighted:ring-2 data-highlighted:ring-ring/50"
                    aria-label={option.name}
                  >
                    <span className="max-w-40 truncate">{option.name}</span>
                    <Combobox.ChipRemove
                      className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={t("remove", { name: option.name })}
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
                  placeholder={chosen.length ? "" : placeholder}
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
              {options.length === 0
                ? noneMessage
                : taken.size === options.length
                  ? allTakenMessage
                  : noMatchMessage}
            </Combobox.Empty>
            <ScrollArea className="group/options *:data-[slot=scroll-area-viewport]:max-h-64">
              {/* Only inset the items when the scrollbar is actually there. */}
              <Combobox.List className="group-data-has-overflow-y/options:pr-2.5">
                {(option: KeyedOption) => (
                  <Combobox.Item
                    key={option.id}
                    value={option}
                    className="flex cursor-default items-center justify-between gap-2 rounded-md p-1.5 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-medium">
                          {option.name}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {option.key}
                        </span>
                      </span>
                      {option.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
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
