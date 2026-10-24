"use client"

import { X } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { Button } from "@/features/shared/components/ui/button"
import { Input } from "@/features/shared/components/ui/input"

type DataTableToolbarProps = {
  // Plural entity name, already translated, for the search field's
  // placeholder and label: "audit events", "Audit-Ereignisse".
  entityLabel: string
  search: string
  onSearchChange: (search: string) => void
  onClearFilters?: () => void
  // The table's primary action, kept opposite the filters.
  action?: ReactNode
  children?: ReactNode
}

export function DataTableToolbar({
  entityLabel,
  search,
  onSearchChange,
  onClearFilters,
  action,
  children,
}: DataTableToolbarProps) {
  const t = useTranslations("common.dataTable")

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Input
        className="w-full sm:w-64"
        type="text"
        inputMode="search"
        aria-label={t("searchLabel", { entity: entityLabel })}
        placeholder={t("search", { entity: entityLabel })}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      {children}
      {onClearFilters && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClearFilters}
          aria-label={t("clearFilters")}
        >
          <X />
        </Button>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  )
}
