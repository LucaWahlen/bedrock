import type { ReactNode } from "react"

type DataTableLayoutProps = {
  pending: boolean
  toolbar: ReactNode
  pagination: ReactNode
  children: ReactNode
}

export function DataTableLayout({
  pending,
  toolbar,
  pagination,
  children,
}: DataTableLayoutProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4" aria-busy={pending}>
      {toolbar}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border">
        {children}
        <div className="shrink-0 border-t py-2">{pagination}</div>
      </div>
    </div>
  )
}
