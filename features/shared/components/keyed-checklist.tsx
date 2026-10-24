"use client"

import type { ReactNode } from "react"

import { Checkbox } from "@/features/shared/components/ui/checkbox"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { cn } from "@/features/shared/lib/ui/utils"

export type KeyedChecklistOption = {
  id: string
  key: string
  name: string
  // Said under the name, such as what else grants it.
  note?: ReactNode
  // Held some other way, so it shows checked and cannot be changed here.
  locked?: boolean
}

type KeyedChecklistProps = {
  id: string
  label: string
  options: KeyedChecklistOption[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

// One checkbox per option, for a set short enough to see whole, where the
// reason something is already held matters as much as the choice.
export function KeyedChecklist({
  id,
  label,
  options,
  value,
  onChange,
  disabled,
}: KeyedChecklistProps) {
  const selected = new Set(value)

  function toggle(optionId: string, checked: boolean) {
    const next = new Set(selected)
    if (checked) next.add(optionId)
    else next.delete(optionId)
    // Kept in the options' order, so a saved set does not depend on clicks.
    onChange(
      options.flatMap((option) => (next.has(option.id) ? option.id : []))
    )
  }

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <ScrollArea className="group/checklist rounded-lg border *:data-[slot=scroll-area-viewport]:max-h-72">
        <ul className="p-1 group-data-has-overflow-y/checklist:pr-2.5">
          {options.map((option) => {
            const checkboxId = `${id}-${option.id}`
            const isDisabled = disabled || option.locked

            return (
              <li
                key={option.id}
                className={cn(
                  "flex items-start gap-3 rounded-md px-2 py-2",
                  !isDisabled && "hover:bg-muted/50"
                )}
              >
                <Checkbox
                  id={checkboxId}
                  className="mt-0.5"
                  checked={option.locked || selected.has(option.id)}
                  disabled={isDisabled}
                  onCheckedChange={(checked) =>
                    toggle(option.id, checked === true)
                  }
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={checkboxId}
                    className={cn(
                      "flex items-baseline gap-2 text-sm",
                      isDisabled ? "cursor-not-allowed" : "cursor-pointer"
                    )}
                  >
                    <span className="truncate font-medium">{option.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {option.key}
                    </span>
                  </label>
                  {option.note && (
                    <div className="text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground">
                      {option.note}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </fieldset>
  )
}
