import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { Badge } from "@/features/shared/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/features/shared/components/ui/card"

type Change =
  // Two totals, compared relatively.
  | { kind: "relative"; current: number; previous: number | null }
  // Two shares, compared in percentage points.
  | { kind: "points"; current: number | null; previous: number | null }

/**
 * The headline cards, in the shape of shadcn's dashboard: a figure, its change
 * as a badge, and two lines saying what changed and what the figure counts.
 * Rising is not assumed to be good, so the change carries no colour.
 */
export function UsageStatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {children}
    </div>
  )
}

export function UsageStatCard({
  label,
  value,
  change,
  context,
}: {
  label: string
  value: string
  change: Change
  context: string
}) {
  const t = useTranslations("usage.comparison")
  const format = useFormatter()

  const { current, previous } = change
  let delta: number | null = null
  let summary: string
  if (current === null) {
    summary = t("nothingYet")
  } else if (previous === null) {
    summary = t("noEarlierData")
  } else if (change.kind === "relative" && previous === 0) {
    summary = current === 0 ? t("flat") : t("noneBefore")
  } else {
    delta =
      change.kind === "points"
        ? Math.round((current - previous) * 100)
        : Math.round(((current - previous) / previous) * 1000) / 1000
    const size =
      change.kind === "points"
        ? t("points", { points: format.number(Math.abs(delta)) })
        : format.number(Math.abs(delta), {
            style: "percent",
            maximumFractionDigits: 1,
          })
    summary =
      delta > 0
        ? t("up", { change: size })
        : delta < 0
          ? t("down", { change: size })
          : t("flat")
  }

  // Rising from nothing is a rise, though not one a percentage can state.
  const rising =
    delta === null
      ? change.kind === "relative" && previous === 0 && !!current
      : delta > 0
  const Icon =
    delta === 0
      ? Minus
      : rising
        ? TrendingUp
        : delta === null
          ? null
          : TrendingDown
  const badge =
    delta === null
      ? change.kind === "relative" && previous === 0 && current
        ? t("new")
        : null
      : change.kind === "points"
        ? t("points", {
            points: format.number(delta, { signDisplay: "exceptZero" }),
          })
        : format.number(delta, {
            style: "percent",
            maximumFractionDigits: 1,
            signDisplay: "exceptZero",
          })

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        {badge && (
          <CardAction>
            <Badge variant="outline" aria-hidden="true">
              {Icon && <Icon />}
              {badge}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardFooter className="mt-auto flex-col items-start gap-1.5 border-t-0 bg-transparent pt-0 text-sm">
        <div className="flex w-full min-w-0 items-center gap-2 font-medium">
          <span className="truncate" title={summary}>
            {summary}
          </span>
          {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        </div>
        <div className="text-muted-foreground">{context}</div>
      </CardFooter>
    </Card>
  )
}
