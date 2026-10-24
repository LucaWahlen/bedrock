import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { cn } from "@/features/shared/lib/ui/utils"

const changed = (chunks: ReactNode) => (
  <span className="text-foreground">{chunks}</span>
)
const unchanged = (chunks: ReactNode) => <span>{chunks}</span>

/**
 * How a period compares with the one before, as one short line. Rising is not
 * assumed to be good, so the colour only separates change from none.
 *
 * `points` compares two shares in percentage points rather than relatively.
 */
export function UsageChange({
  current,
  previous,
  period,
  points = false,
}: {
  current: number
  previous: number | null
  period: number
  points?: boolean
}) {
  const t = useTranslations("usage.change")
  const format = useFormatter()

  if (previous === null) {
    return <span>{t("noEarlierData")}</span>
  }
  if (!points && previous === 0) {
    return <span>{current === 0 ? t("noneEither") : t("noneBefore")}</span>
  }

  const change = points ? current - previous : (current - previous) / previous
  const rounded = Math.round(change * 100)
  const Icon = rounded > 0 ? TrendingUp : rounded < 0 ? TrendingDown : Minus
  const label = points
    ? t("points", {
        points: format.number(rounded, { signDisplay: "exceptZero" }),
      })
    : format.number(change, {
        style: "percent",
        maximumFractionDigits: 0,
        signDisplay: "exceptZero",
      })

  return (
    <span className="inline-flex items-center gap-1">
      <Icon
        className={cn("size-3", rounded !== 0 && "text-foreground")}
        aria-hidden="true"
      />
      <span>
        {t.rich("comparison", {
          change: rounded === 0 ? t("noChange") : label,
          period,
          highlight: rounded === 0 ? unchanged : changed,
        })}
      </span>
    </span>
  )
}
