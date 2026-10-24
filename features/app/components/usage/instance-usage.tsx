import { useFormatter, useTranslations } from "next-intl"
import { Suspense } from "react"

import { UsageReportSkeleton } from "@/features/app/components/usage/skeletons"
import {
  ActivitySection,
  AuthenticationSections,
  CoverageNote,
  EngagementSections,
  useEmptyMessage,
} from "@/features/app/components/usage/usage-sections"
import type { Organization } from "@/features/organizations"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import {
  getInstanceUsageReport,
  UsageCard,
  UsageDailyBars,
  UsageDonutChart,
  UsageOrganizationsTable,
  UsagePeriodFrame,
  UsageStatCard,
  UsageStatGrid,
  type InstanceUsageReport,
  type UsagePeriod,
} from "@/features/usage"

function Stats({ usage }: { usage: InstanceUsageReport }) {
  const t = useTranslations("usage")
  const format = useFormatter()
  const count = (value: number) =>
    format.number(value, { maximumFractionDigits: 1 })
  const percent = (value: number | null) =>
    value === null
      ? t("empty.value")
      : format.number(value, { style: "percent", maximumFractionDigits: 1 })
  const failures = usage.activity.reduce(
    (sum, point) => sum + (point.failures ?? 0),
    0
  )

  return (
    <UsageStatGrid>
      <UsageStatCard
        label={t("cards.organizations.label")}
        value={count(usage.organizations.current)}
        change={{ kind: "relative", ...usage.organizations }}
        context={t("cards.organizations.context", {
          created: usage.newOrganizations,
        })}
      />
      <UsageStatCard
        label={t("cards.users.label")}
        value={count(usage.users.current)}
        change={{ kind: "relative", ...usage.users }}
        context={t("cards.users.context", {
          created: usage.newUsers.current,
        })}
      />
      <UsageStatCard
        label={t("cards.signIns.label")}
        value={count(usage.signIns.current)}
        change={{ kind: "relative", ...usage.signIns }}
        context={t("cards.signIns.instance")}
      />
      <UsageStatCard
        label={t("cards.activeUsers.label")}
        value={count(usage.activeUsers.current)}
        change={{ kind: "relative", ...usage.activeUsers }}
        context={t("cards.activeUsers.context")}
      />
      <UsageStatCard
        label={t("cards.weeklyActiveUsers.label")}
        value={count(usage.weeklyActiveUsers.current)}
        change={{ kind: "relative", ...usage.weeklyActiveUsers }}
        context={t("cards.weeklyActiveUsers.context")}
      />
      <UsageStatCard
        label={t("cards.stickiness.label")}
        value={percent(usage.stickiness.current)}
        change={{ kind: "points", ...usage.stickiness }}
        context={t("cards.stickiness.context")}
      />
      <UsageStatCard
        label={t("cards.successRate.label")}
        value={percent(usage.successRate.current)}
        change={{ kind: "points", ...usage.successRate }}
        context={t("cards.successRate.context", { failures })}
      />
      <UsageStatCard
        label={t("cards.secondFactor.label")}
        value={percent(usage.secondFactorRate.current)}
        change={{ kind: "points", ...usage.secondFactorRate }}
        context={t("cards.secondFactor.instance", {
          secured: usage.secondFactor.holders,
          total: usage.secondFactor.total,
        })}
      />
    </UsageStatGrid>
  )
}

function Organizations({
  usage,
  basePath,
}: {
  usage: InstanceUsageReport
  basePath: string
}) {
  const t = useTranslations("usage")
  const empty = useEmptyMessage(usage.coverage)

  return (
    <div className="grid gap-4 md:gap-6 @5xl/main:grid-cols-3">
      <UsageCard
        title={t("topOrganizations.title")}
        description={t("topOrganizations.description")}
        link={{
          href: `${basePath}/organizations`,
          label: t("topOrganizations.link"),
        }}
        className="@5xl/main:col-span-2"
      >
        <UsageOrganizationsTable
          organizations={usage.topOrganizations}
          hrefFor={(organization) =>
            `${basePath}/organizations?search=${encodeURIComponent(organization.slug)}`
          }
          empty={empty(t("topOrganizations.empty"))}
        />
      </UsageCard>
      <UsageCard
        title={t("organizationStatus.title")}
        description={t("organizationStatus.description")}
      >
        <UsageDonutChart
          slices={usage.organizationStatus.map((status) => ({
            key: status.key,
            label: t(`organizationStatus.${status.key}`),
            value: status.value,
          }))}
          totalLabel={t("organizationStatus.total")}
          caption={t("organizationStatus.caption")}
          columns={[
            t("organizationStatus.status"),
            t("organizationStatus.count"),
            t("organizationStatus.share"),
          ]}
          empty={t("organizationStatus.empty")}
        />
      </UsageCard>
    </div>
  )
}

function ReportBody({
  report,
  basePath,
}: {
  report: InstanceUsageReport
  basePath: string
}) {
  const t = useTranslations("usage")
  const empty = useEmptyMessage(report.coverage)

  return (
    <>
      <CoverageNote coverage={report.coverage} />
      <Stats usage={report} />
      <ActivitySection usage={report} />
      <Organizations usage={report} basePath={basePath} />
      <AuthenticationSections usage={report} scope="instance" />
      <EngagementSections usage={report} />
      <UsageCard
        title={t("userGrowth.title")}
        description={t("userGrowth.description")}
      >
        <UsageDailyBars
          points={report.userGrowth}
          series={[
            {
              key: "value",
              label: t("userGrowth.series"),
              color: "var(--primary)",
            },
          ]}
          period={report.period}
          caption={t("userGrowth.caption")}
          empty={empty(t("userGrowth.empty"))}
        />
      </UsageCard>
    </>
  )
}

async function Report({
  usage,
  basePath,
}: {
  usage: Promise<InstanceUsageReport>
  basePath: string
}) {
  return <ReportBody report={await usage} basePath={basePath} />
}

/**
 * The instance's usage for root administrators: its size and growth, daily
 * activity across every tenant, how people sign in, and the organizations
 * that account for most of it.
 */
export function InstanceUsageDashboard({
  organization,
  period,
}: {
  organization: Pick<Organization, "slug">
  period: UsagePeriod
}) {
  const usage = getInstanceUsageReport({ period })

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="@container/main mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <UsagePeriodFrame>
          <Suspense fallback={<UsageReportSkeleton />}>
            <Report usage={usage} basePath={`/org/${organization.slug}`} />
          </Suspense>
        </UsagePeriodFrame>
      </div>
    </ScrollArea>
  )
}
