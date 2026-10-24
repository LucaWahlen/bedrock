import { useFormatter } from "next-intl"
import Link from "next/link"

export type UsageBarItem = {
  id: string
  label: string
  // Shown muted after the label, such as a deleted marker.
  note?: string
  value: number
  // What the value means, spelled out for assistive technology.
  valueLabel: string
  href?: string
}

/**
 * A ranked list whose bars share one scale, the largest value filling the row.
 * The numbers are text, so the list needs no separate accessible table.
 */
export function UsageBarList({
  items,
  empty,
}: {
  items: UsageBarItem[]
  empty: string
}) {
  const format = useFormatter()

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  const largest = Math.max(...items.map((item) => item.value), 1)

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {item.href ? (
                <Link
                  href={item.href}
                  className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium">{item.label}</span>
              )}
              {item.note && (
                <span className="ml-1.5 text-muted-foreground">
                  {item.note}
                </span>
              )}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              <span aria-hidden="true">
                {format.number(item.value, { maximumFractionDigits: 2 })}
              </span>
              <span className="sr-only">{item.valueLabel}</span>
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(item.value / largest) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
