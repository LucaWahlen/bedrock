"use client"

import type { ReactTable, RowData, TableFeatures } from "@tanstack/react-table"
import { ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { Fragment, useState, type ReactNode } from "react"

import { Button } from "@/features/shared/components/ui/button"
import { ScrollRegion } from "@/features/shared/components/ui/scroll-region"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/features/shared/components/ui/table"

// Matches `TableHead`'s height, so the scrollbar clears the sticky header.
const HEADER_HEIGHT = "2.5rem"

type DataTableProps<TFeatures extends TableFeatures, TData extends RowData> = {
  table: ReactTable<TFeatures, TData>
  emptyMessage: string
  // Names the table for screen readers navigating by landmark/table.
  ariaLabel: string
  // Columns rendered at their natural width instead of sharing the table width.
  shrinkColumnIds?: string[]
  // Providing this adds a toggle column that reveals the returned detail row.
  renderDetail?: (row: TData) => ReactNode
}

export function DataTable<
  TFeatures extends TableFeatures,
  TData extends RowData,
>({
  table,
  emptyMessage,
  ariaLabel,
  shrinkColumnIds = [],
  renderDetail,
}: DataTableProps<TFeatures, TData>) {
  const t = useTranslations("common.dataTable")
  // Keyed by row id, so give the table a stable `getRowId` when rows are paged.
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([])
  const rows = table.getRowModel().rows
  const columnCount = table.getAllLeafColumns().length + (renderDetail ? 1 : 0)
  const shrinkClassName = (columnId: string) =>
    shrinkColumnIds.includes(columnId) ? "w-0" : undefined

  function toggleRow(rowId: string) {
    setExpandedRowIds((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]
    )
  }

  return (
    <ScrollRegion
      insetTop={HEADER_HEIGHT}
      className="group/table min-h-0 flex-1 [&_[data-slot=table-container]]:overflow-visible"
    >
      <Table
        aria-label={ariaLabel}
        className="group-data-has-overflow-y/table:[&_tbody>tr>td:last-child]:pr-4.5"
      >
        <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {renderDetail && (
                <TableHead className="w-0">
                  <span className="sr-only">{t("details")}</span>
                </TableHead>
              )}
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={shrinkClassName(header.column.id)}
                >
                  {header.isPlaceholder ? null : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => {
              const isExpanded = expandedRowIds.includes(row.id)
              const detailId = `${row.id}-detail`

              return (
                <Fragment key={row.id}>
                  <TableRow>
                    {renderDetail && (
                      <TableCell className="w-0">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-expanded={isExpanded}
                          aria-controls={detailId}
                          onClick={() => toggleRow(row.id)}
                        >
                          <ChevronRight
                            className={isExpanded ? "rotate-90" : undefined}
                          />
                          <span className="sr-only">
                            {isExpanded ? t("hideDetails") : t("showDetails")}
                          </span>
                        </Button>
                      </TableCell>
                    )}
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={shrinkClassName(cell.column.id)}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                  {renderDetail && isExpanded && (
                    <TableRow id={detailId} className="hover:bg-transparent">
                      <TableCell colSpan={columnCount} className="bg-muted/40">
                        {renderDetail(row.original)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="h-28 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ScrollRegion>
  )
}
