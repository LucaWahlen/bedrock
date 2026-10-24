"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/features/shared/components/ui/button"

type SortableColumn = {
  getIsSorted: () => false | "asc" | "desc"
  toggleSorting: (descending?: boolean) => void
}

type DataTableSortableHeaderProps = {
  column: SortableColumn
  label: string
}

export function DataTableSortableHeader({
  column,
  label,
}: DataTableSortableHeaderProps) {
  const t = useTranslations("common.dataTable")
  const sorting = column.getIsSorted()

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorting === "asc")}
    >
      {label}
      {sorting && (
        <span className="sr-only">
          {sorting === "asc" ? t("sortedAscending") : t("sortedDescending")}
        </span>
      )}
      {sorting === "asc" ? (
        <ArrowUp />
      ) : sorting === "desc" ? (
        <ArrowDown />
      ) : (
        <ArrowUpDown />
      )}
    </Button>
  )
}
