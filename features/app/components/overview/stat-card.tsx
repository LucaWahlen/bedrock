import type { LucideIcon } from "lucide-react"
import { useFormatter } from "next-intl"
import Link from "next/link"
import type { ReactNode } from "react"

import { Card } from "@/features/shared/components/ui/card"

export type Stat = {
  label: string
  // A number is formatted here; a string, such as a percentage, is shown as is.
  value: number | string
  href: string
  icon: LucideIcon
  hint?: ReactNode
}

// Legacy: the usage dashboards still format with it until they are translated.
// New code formats numbers with next-intl's `useFormatter` or `getFormatter`.

export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  )
}

export function StatCard({ label, value, href, icon: Icon, hint }: Stat) {
  const format = useFormatter()

  return (
    <Link
      href={href}
      className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {/* The hover darkens the ring at once. Animating the background of a
          rounded, clipped card made its edges flash on the first hover. */}
      <Card className="h-full gap-3 px-4 py-4 group-hover:ring-foreground/20">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-2xl leading-none font-semibold tabular-nums">
            {typeof value === "number" ? format.number(value) : value}
          </p>
          {hint && (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
      </Card>
    </Link>
  )
}
