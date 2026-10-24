import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/features/shared/components/ui/button"

// Structural rather than generic over table features, so any table with
// pagination enabled satisfies it.
type PaginatedTable = {
  getPageCount: () => number
  getRowCount: () => number
  getCanPreviousPage: () => boolean
  getCanNextPage: () => boolean
  setPageIndex: (pageIndex: number) => void
  previousPage: () => void
  nextPage: () => void
  state: { pagination: { pageIndex: number } }
}

type DataTablePaginationProps = {
  table: PaginatedTable
  // Already translated nouns, chosen by the count.
  singularLabel: string
  pluralLabel: string
}

export function DataTablePagination({
  table,
  singularLabel,
  pluralLabel,
}: DataTablePaginationProps) {
  const pageCount = table.getPageCount()
  const currentPage = pageCount === 0 ? 0 : table.state.pagination.pageIndex + 1
  const rowCount = table.getRowCount()
  const t = useTranslations("common.dataTable.pagination")

  return (
    <div className="flex shrink-0 flex-row items-center justify-between gap-2 px-2">
      <div className="hidden flex-1 text-sm text-muted-foreground tabular-nums md:flex">
        {t("rows", {
          count: rowCount,
          label: rowCount === 1 ? singularLabel : pluralLabel,
        })}
      </div>
      <div className="flex flex-1 items-center justify-center gap-4 md:justify-end lg:gap-8">
        <div className="flex w-25 items-center justify-center text-sm font-medium tabular-nums">
          {t("page", { page: currentPage, pages: pageCount })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">{t("first")}</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">{t("previous")}</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">{t("next")}</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">{t("last")}</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
