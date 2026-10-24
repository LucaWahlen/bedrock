import type { useFormatter } from "next-intl"

import type { Metric } from "@/features/app/components/overview/metric-card"
import type { Translator } from "@/features/shared/lib/i18n/translator"
import type { UsageComparison } from "@/features/usage"

type Format = ReturnType<typeof useFormatter>
type Translate = Translator<"app.overview.metrics">

// A count over the last seven days against the seven before, or a snapshot
// against the one seven days ago.
export type ChangeBasis = "period" | "snapshot"

function directionOf(rounded: number) {
  return rounded > 0 ? "up" : rounded < 0 ? "down" : "flat"
}

function describe(
  t: Translate,
  basis: ChangeBasis,
  rounded: number,
  magnitude: string,
  signed: string
): Pick<Metric, "trend" | "summary"> {
  const direction = directionOf(rounded)

  return {
    trend: { direction, change: signed },
    summary:
      direction === "flat"
        ? t("trend.flat", { basis })
        : t(`trend.${direction}`, { basis, change: magnitude }),
  }
}

/** The relative change of a total, as a badge and a sentence. */
export function describeChange(
  t: Translate,
  format: Format,
  { current, previous }: UsageComparison,
  basis: ChangeBasis = "period"
): Pick<Metric, "trend" | "summary"> {
  if (previous === null) {
    return { trend: null, summary: t("trend.noEarlierData") }
  }
  if (previous === 0) {
    return {
      trend: null,
      summary:
        current === 0
          ? t("trend.flat", { basis })
          : t("trend.noneBefore", { basis }),
    }
  }

  const change = (current - previous) / previous
  const percent = { style: "percent", maximumFractionDigits: 0 } as const

  return describe(
    t,
    basis,
    Math.round(change * 100),
    format.number(Math.abs(change), percent),
    format.number(change, { ...percent, signDisplay: "exceptZero" })
  )
}

/** The change of a share, in percentage points rather than relatively. */
export function describeShareChange(
  t: Translate,
  format: Format,
  current: number,
  previous: number | null
): Pick<Metric, "trend" | "summary"> {
  if (previous === null) {
    return { trend: null, summary: t("trend.noEarlierData") }
  }

  const rounded = Math.round((current - previous) * 100)
  const points = (value: number, signDisplay: "auto" | "exceptZero") =>
    t("trend.points", { points: format.number(value, { signDisplay }) })

  return describe(
    t,
    "snapshot",
    rounded,
    points(Math.abs(rounded), "auto"),
    points(rounded, "exceptZero")
  )
}
