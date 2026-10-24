import { TrendingDown, TrendingUp } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"

import { relativeChange } from "@/features/usage/utils/chart"

// A table cell's change on the previous period, or a dash when there is none
// to state. The arrow is decorative; the signed figure says it.
export function UsageChangeCell({
  current,
  previous,
}: {
  current: number
  previous: number | null
}) {
  const t = useTranslations("usage")
  const format = useFormatter()
  const change = relativeChange(current, previous)

  if (change === null) {
    return (
      <span className="text-muted-foreground">
        {previous === 0 && current > 0 ? t("comparison.new") : t("empty.value")}
      </span>
    )
  }

  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : null

  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {Icon && (
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      )}
      {format.number(change, {
        style: "percent",
        maximumFractionDigits: 0,
        signDisplay: "exceptZero",
      })}
    </span>
  )
}
