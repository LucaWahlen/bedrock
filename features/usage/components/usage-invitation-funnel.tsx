import { useFormatter, useTranslations } from "next-intl"

import { ChartEmpty } from "@/features/usage/components/chart-empty"
import type { InvitationFunnel } from "@/features/usage/types"
import { tint } from "@/features/usage/utils/chart"

const OUTCOMES = [
  { key: "accepted", color: "var(--primary)" },
  { key: "open", color: tint(55) },
  { key: "revoked", color: "var(--muted-foreground)" },
  { key: "expired", color: tint(25) },
] as const

/**
 * Invitations sent in the period, split by what became of them: one stacked
 * bar for the whole, then each outcome with its count and share.
 */
export function UsageInvitationFunnel({
  funnel,
  empty,
  note,
}: {
  funnel: InvitationFunnel
  empty: string
  note?: string
}) {
  const t = useTranslations("usage.invitations")
  const format = useFormatter()
  const percent = (value: number) =>
    format.number(funnel.sent > 0 ? value / funnel.sent : 0, {
      style: "percent",
      maximumFractionDigits: 0,
    })

  if (funnel.sent === 0) {
    return (
      <div className="flex flex-col gap-3">
        <ChartEmpty>{empty}</ChartEmpty>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">
            {format.number(funnel.sent)}
          </span>
          <span className="text-sm text-muted-foreground">{t("sent")}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t("acceptance", { rate: percent(funnel.accepted) })}
        </span>
      </div>
      <div
        className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        {OUTCOMES.map(({ key, color }) =>
          funnel[key] > 0 ? (
            <div
              key={key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(funnel[key] / funnel.sent) * 100}%`,
                backgroundColor: color,
              }}
            />
          ) : null
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {OUTCOMES.map(({ key, color }) => (
          <div key={key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <dt className="flex-1 text-muted-foreground">{t(key)}</dt>
            <dd className="font-medium tabular-nums">
              {format.number(funnel[key])}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {percent(funnel[key])}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}
