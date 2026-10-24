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
  getOrganizationUsageReport,
  tint,
  UsageApplicationsTable,
  UsageBarBreakdown,
  UsageCard,
  UsageDailyBars,
  UsageInvitationFunnel,
  UsagePeriodFrame,
  UsageStatCard,
  UsageStatGrid,
  type OrganizationUsageReport,
  type UsagePeriod,
} from "@/features/usage"

const ROLE_KEYS = ["owner", "admin", "member"] as const

function Stats({ usage }: { usage: OrganizationUsageReport }) {
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
        label={t("cards.signIns.label")}
        value={count(usage.signIns.current)}
        change={{ kind: "relative", ...usage.signIns }}
        context={t("cards.signIns.organization")}
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
        label={t("cards.tokensIssued.label")}
        value={count(usage.tokensIssued.current)}
        change={{ kind: "relative", ...usage.tokensIssued }}
        context={t("cards.tokensIssued.context")}
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
        context={t("cards.secondFactor.organization", {
          secured: usage.secondFactor.holders,
          total: usage.secondFactor.total,
        })}
      />
      <UsageStatCard
        label={t("cards.newMembers.label")}
        value={count(usage.newMembers.current)}
        change={{ kind: "relative", ...usage.newMembers }}
        context={t("cards.newMembers.context", {
          removed: usage.membersRemoved,
          members: usage.members,
        })}
      />
    </UsageStatGrid>
  )
}

function Members({ usage }: { usage: OrganizationUsageReport }) {
  const t = useTranslations("usage")
  const empty = useEmptyMessage(usage.coverage)
  const retention = usage.invitations.retentionDays

  return (
    <div className="grid gap-4 md:gap-6 @3xl/main:grid-cols-2 @6xl/main:grid-cols-3">
      <UsageCard
        title={t("growth.title")}
        description={t("growth.description")}
        className="@3xl/main:col-span-2 @6xl/main:col-span-1"
      >
        <UsageDailyBars
          points={usage.growth}
          series={[
            {
              key: "joined",
              label: t("growth.joined"),
              color: "var(--primary)",
            },
            {
              key: "removed",
              label: t("growth.removed"),
              color: tint(35),
              below: true,
            },
          ]}
          period={usage.period}
          caption={t("growth.caption")}
          empty={empty(t("growth.empty"))}
        />
      </UsageCard>
      <UsageCard
        title={t("invitations.title")}
        description={t("invitations.description")}
      >
        <UsageInvitationFunnel
          funnel={usage.invitations}
          empty={t("invitations.empty")}
          note={
            retention !== null && retention < usage.period
              ? t("invitations.truncated", { days: retention })
              : undefined
          }
        />
      </UsageCard>
      <UsageCard title={t("roles.title")} description={t("roles.description")}>
        <UsageBarBreakdown
          bars={usage.roles.map((role) => ({
            key: role.key,
            label: (ROLE_KEYS as readonly string[]).includes(role.key)
              ? t(`roles.${role.key as (typeof ROLE_KEYS)[number]}`)
              : role.key,
            value: role.value,
          }))}
          empty={t("roles.empty")}
        />
      </UsageCard>
    </div>
  )
}

async function Report({
  usage,
  basePath,
}: {
  usage: Promise<OrganizationUsageReport>
  basePath: string
}) {
  return <ReportBody report={await usage} basePath={basePath} />
}

function ReportBody({
  report,
  basePath,
}: {
  report: OrganizationUsageReport
  basePath: string
}) {
  const t = useTranslations("usage")
  const empty = useEmptyMessage(report.coverage)

  return (
    <>
      <CoverageNote coverage={report.coverage} />
      <Stats usage={report} />
      <ActivitySection usage={report} />
      <AuthenticationSections usage={report} scope="organization" />
      <EngagementSections usage={report} />
      <UsageCard
        title={t("applications.title")}
        description={t("applications.description")}
        link={{
          href: `${basePath}/applications`,
          label: t("applications.link"),
        }}
      >
        <UsageApplicationsTable
          applications={report.applications}
          total={report.tokensIssued.current}
          empty={empty(t("applications.empty"))}
        />
      </UsageCard>
      <Members usage={report} />
    </>
  )
}

/**
 * A tenant's usage in depth: eight headline figures, daily activity, how
 * people sign in and fail to, engagement, applications and membership. One
 * read feeds every section; the range picker renders at once.
 */
export function OrganizationUsageDashboard({
  organization,
  period,
}: {
  organization: Pick<Organization, "id" | "slug">
  period: UsagePeriod
}) {
  const usage = getOrganizationUsageReport({
    organizationId: organization.id,
    period,
  })

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
