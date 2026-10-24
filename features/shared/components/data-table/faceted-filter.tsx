"use client"

import { PlusCircle, type LucideIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"

import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { Button } from "@/features/shared/components/ui/button"
import { Checkbox } from "@/features/shared/components/ui/checkbox"
import { Input } from "@/features/shared/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/features/shared/components/ui/popover"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { Separator } from "@/features/shared/components/ui/separator"

export type FacetOption = {
  label: string
  value: string
  icon?: LucideIcon
  count?: number
  group?: string
  description?: string | null
  avatar?: { seed: string; logo?: string | null }
}

type DataTableFacetedFilterProps = {
  title: string
  options: FacetOption[]
  selected: string[]
  onChange: (values: string[]) => void
}

export function DataTableFacetedFilter({
  title,
  options,
  selected,
  onChange,
}: DataTableFacetedFilterProps) {
  const t = useTranslations("common.dataTable.filter")
  const format = useFormatter()
  const [query, setQuery] = useState("")
  const selectedValues = new Set(selected)
  const visibleOptions = options.filter((option) =>
    `${option.label} ${option.description ?? ""}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  )
  const groupedOptions = new Map<string, FacetOption[]>()
  for (const option of visibleOptions) {
    const group = option.group ?? ""
    const existing = groupedOptions.get(group)
    if (existing) existing.push(option)
    else groupedOptions.set(group, [option])
  }
  const visibleGroups = Array.from(groupedOptions.entries())

  function toggleValue(value: string) {
    const nextValues = new Set(selectedValues)
    if (nextValues.has(value)) nextValues.delete(value)
    else nextValues.add(value)

    onChange(Array.from(nextValues))
  }

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" className="border-dashed" />}
      >
        <PlusCircle />
        {title}
        {selectedValues.size > 0 && (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 data-vertical:self-center"
            />
            <span className="rounded-sm bg-secondary px-1.5 font-normal lg:hidden">
              {selectedValues.size}
            </span>
            <span className="hidden items-center gap-1 lg:flex">
              {selectedValues.size > 2 ? (
                <span className="rounded-sm bg-secondary px-1.5 font-normal">
                  {t("selected", { count: selectedValues.size })}
                </span>
              ) : (
                options
                  .filter((option) => selectedValues.has(option.value))
                  .map((option) => {
                    const OptionIcon = option.icon

                    return (
                      <span
                        key={option.value}
                        className="flex items-center gap-1 rounded-sm bg-secondary px-1.5 font-normal"
                      >
                        {OptionIcon && (
                          <OptionIcon className="size-3" aria-hidden="true" />
                        )}
                        {option.label}
                      </span>
                    )
                  })
              )}
            </span>
          </>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-64 gap-0 p-0" align="start">
        <div className="p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search")}
            aria-label={t("searchLabel", { title })}
          />
        </div>
        <Separator />
        <ScrollArea className="*:data-[slot=scroll-area-viewport]:max-h-72">
          <fieldset className="p-1">
            <legend className="sr-only">{t("legend", { title })}</legend>
            {visibleGroups.length ? (
              visibleGroups.map(([group, groupOptions]) => (
                <div key={group}>
                  {group && (
                    <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                      {group}
                    </div>
                  )}
                  {groupOptions.map((option) => {
                    const isSelected = selectedValues.has(option.value)
                    const OptionIcon = option.icon

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="ghost"
                        className={
                          option.description
                            ? "h-auto w-full justify-start py-1.5 font-normal"
                            : "w-full justify-start font-normal"
                        }
                        aria-pressed={isSelected}
                        onClick={() => toggleValue(option.value)}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="pointer-events-none"
                          tabIndex={-1}
                          aria-hidden
                        />
                        {OptionIcon && (
                          <OptionIcon className="size-4" aria-hidden="true" />
                        )}
                        {option.avatar && (
                          <IdentityAvatar
                            seed={option.avatar.seed}
                            logo={option.avatar.logo}
                            name={option.label}
                            variant="sm"
                          />
                        )}
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate">{option.label}</span>
                          {option.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {format.number(option.count ?? 0)}
                        </span>
                      </Button>
                    )
                  })}
                </div>
              ))
            ) : (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("noResults")}
              </div>
            )}
          </fieldset>
        </ScrollArea>
        {selectedValues.size > 0 && (
          <>
            <Separator />
            <div className="p-1">
              <Button
                type="button"
                variant="ghost"
                className="w-full font-normal"
                onClick={() => onChange([])}
              >
                {t("clear")}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
