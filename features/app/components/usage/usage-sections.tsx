import { Info } from "lucide-react"
import { useTranslations } from "next-intl"

import { Badge } from "@/features/shared/components/ui/badge"
import {
  UsageActivityChart,
  UsageBarBreakdown,
  UsageCard,
  UsageDonutChart,
  UsageHeatmap,
  UsageLineChart,
  coverageNote,
  tint,
  type SignInFailureReason,
  type SignInMethod,
  type UsageCoverage,
  type UsageReportBase,
} from "@/features/usage"

const METHOD_KEYS = {
  password: "password",
  two_factor: "twoFactor",
  passkey: "passkey",
} as const satisfies Record<SignInMethod, string>

const REASON_KEYS = {
  invalid_credentials: "invalidCredentials",
  second_factor: "secondFactor",
  passkey: "passkey",
  rate_limited: "rateLimited",
  disabled: "disabled",
  not_member: "notMember",
  suspended: "suspended",
  other: "other",
} as const satisfies Record<SignInFailureReason, string>

// An empty chart says why: nothing happened, or nothing was rolled up yet.
export function useEmptyMessage(coverage: UsageCoverage) {
  const t = useTranslations("usage.empty")
  return (quiet: string) =>
    coverage.pastDays > 0 && coverage.rolledUpDays === 0
      ? t("notRolledUp")
      : quiet
}

export function CoverageNote({ coverage }: { coverage: UsageCoverage }) {
  const t = useTranslations("usage")
  const note = coverageNote(t, coverage)
  if (!note) return null

  return (
    <Badge variant="outline" className="h-6 text-muted-foreground">
      <Info aria-hidden="true" />
      {note}
    </Badge>
  )
}

export function ActivitySection({ usage }: { usage: UsageReportBase }) {
  const t = useTranslations("usage.activity")
  const empty = useEmptyMessage(usage.coverage)
  const total = (key: "signIns" | "failures") =>
    usage.activity.reduce((sum, point) => sum + (point[key] ?? 0), 0)

  return (
    <UsageActivityChart
      points={usage.activity}
      totals={{
        signIns: usage.signIns.current,
        activeUsers: usage.activeUsers.current,
        failures: total("failures"),
      }}
      period={usage.period}
      empty={empty(t("empty"))}
    />
  )
}

export function AuthenticationSections({
  usage,
  scope,
}: {
  usage: UsageReportBase
  scope: "organization" | "instance"
}) {
  const t = useTranslations("usage")
  const empty = useEmptyMessage(usage.coverage)
  const { methods, failureReasons, secondFactorTrend } = usage.authentication

  return (
    <div className="grid gap-4 md:gap-6 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
      <UsageCard
        title={t("methods.title")}
        description={t("methods.description")}
      >
        <UsageDonutChart
          slices={methods.map((method) => ({
            key: method.key,
            label: t(`methods.${METHOD_KEYS[method.key]}`),
            value: method.value,
          }))}
          totalLabel={t("methods.total")}
          caption={t("methods.caption")}
          columns={[
            t("methods.method"),
            t("methods.count"),
            t("methods.share"),
          ]}
          empty={empty(t("methods.empty"))}
        />
      </UsageCard>
      <UsageCard
        title={t("failures.title")}
        description={t("failures.description")}
      >
        <UsageBarBreakdown
          bars={failureReasons.map((reason) => ({
            key: reason.key,
            label: t(`failures.reasons.${REASON_KEYS[reason.key]}`),
            value: reason.value,
          }))}
          color="var(--destructive)"
          empty={empty(t("failures.empty"))}
        />
      </UsageCard>
      <UsageCard
        title={t("secondFactor.title")}
        description={t(`secondFactor.${scope}`)}
        className="@3xl/main:col-span-2 @6xl/main:col-span-1"
      >
        <UsageLineChart
          points={secondFactorTrend.map((point) => ({
            day: point.day,
            rate: point.rate,
          }))}
          series={[
            {
              key: "rate",
              label: t("secondFactor.series"),
              color: "var(--primary)",
            },
          ]}
          period={usage.period}
          percent
          sparse
          caption={t("secondFactor.caption")}
          empty={t("secondFactor.empty")}
        />
      </UsageCard>
    </div>
  )
}

export function EngagementSections({ usage }: { usage: UsageReportBase }) {
  const t = useTranslations("usage")
  const empty = useEmptyMessage(usage.coverage)

  return (
    <div className="grid gap-4 md:gap-6 @5xl/main:grid-cols-2">
      <UsageCard
        title={t("engagement.title")}
        description={t("engagement.description")}
      >
        <UsageLineChart
          points={usage.engagement}
          series={[
            {
              key: "daily",
              label: t("engagement.daily"),
              color: "var(--primary)",
            },
            { key: "weekly", label: t("engagement.weekly"), color: tint(60) },
            {
              key: "monthly",
              label: t("engagement.monthly"),
              color: tint(30),
            },
          ]}
          period={usage.period}
          caption={t("engagement.caption")}
          empty={empty(t("engagement.empty"))}
        />
      </UsageCard>
      <UsageCard
        title={t("heatmap.title")}
        description={t("heatmap.description")}
      >
        <UsageHeatmap grid={usage.heatmap} empty={empty(t("heatmap.empty"))} />
      </UsageCard>
    </div>
  )
}
