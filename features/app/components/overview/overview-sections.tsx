import { getFormatter, getTranslations } from "next-intl/server"

import { ActivityCard } from "@/features/app/components/overview/activity-card"
import { ActivityChart } from "@/features/app/components/overview/activity-chart"
import {
  describeChange,
  describeShareChange,
} from "@/features/app/components/overview/describe-change"
import {
  MetricCard,
  MetricGrid,
  type Metric,
} from "@/features/app/components/overview/metric-card"
import {
  getMemberApplications,
  MemberApplicationList,
} from "@/features/applications"
import { listAuditEvents, RecentAuditEventList } from "@/features/audit"
import {
  getMemberOrganizations,
  MemberOrganizationList,
  PendingInvitationList,
  type MembershipSummary,
} from "@/features/organizations"
import { getInstanceUsage, getOrganizationUsage } from "@/features/usage"

// Each section reads for itself through an action that rechecks the caller, so
// none of them relies on the capability that chose to render it.

const RECENT_EVENTS = 8
// The key figures compare a week with the one before; the chart shows a month.
const METRIC_PERIOD = 7
const CHART_PERIOD = 30

export async function YourApplications({
  organizationId,
  manageHref,
}: {
  organizationId: string
  manageHref?: string
}) {
  const applications = await getMemberApplications(organizationId)

  return (
    <MemberApplicationList
      applications={applications}
      manageHref={manageHref}
    />
  )
}

export async function YourOrganizations({
  organizationId,
}: {
  organizationId: string
}) {
  const organizations = await getMemberOrganizations(organizationId)

  return <MemberOrganizationList organizations={organizations} />
}

export async function PendingInvitations({
  summary,
}: {
  summary: Promise<MembershipSummary>
}) {
  const { invitations } = await summary

  return <PendingInvitationList invitations={invitations} />
}

export async function RecentActivity({
  organizationId,
}: {
  // Omitted for the instance log, which only root administration may read.
  organizationId?: string
}) {
  const { events } = await listAuditEvents({
    organizationId,
    pageSize: RECENT_EVENTS,
  })

  return <RecentAuditEventList events={events} />
}

// A tenant's week, for its owners and admins.
export async function OrganizationMetrics({
  organizationId,
  usageHref,
}: {
  organizationId: string
  usageHref: string
}) {
  const [t, format, usage] = await Promise.all([
    getTranslations("app.overview.metrics"),
    getFormatter(),
    getOrganizationUsage({ organizationId, period: METRIC_PERIOD }),
  ])
  const { members, withSecondFactor, previousRate } = usage.secondFactor
  const rate = members > 0 ? withSecondFactor / members : 0

  const metrics: Metric[] = [
    {
      label: t("activeUsers"),
      value: format.number(usage.activeUsers.current, {
        maximumFractionDigits: 1,
      }),
      ...describeChange(t, format, usage.activeUsers),
      detail: t("detail.dailyAverage"),
    },
    {
      label: t("signIns"),
      value: format.number(usage.signIns.current),
      ...describeChange(t, format, usage.signIns),
      detail: t("detail.signIns"),
    },
    {
      label: t("tokensIssued"),
      value: format.number(usage.tokensIssued.current),
      ...describeChange(t, format, usage.tokensIssued),
      detail: t("detail.tokensIssued"),
    },
    {
      label: t("secondFactor"),
      value: format.number(rate, { style: "percent" }),
      ...describeShareChange(t, format, rate, previousRate),
      detail: t("detail.secondFactor", {
        count: withSecondFactor,
        total: members,
      }),
    },
  ]

  return (
    <MetricGrid>
      {metrics.map((metric) => (
        <MetricCard key={metric.label} metric={metric} href={usageHref} />
      ))}
    </MetricGrid>
  )
}

// The instance's week, for root administrators on root.
export async function InstanceMetrics({ usageHref }: { usageHref: string }) {
  const [t, format, usage] = await Promise.all([
    getTranslations("app.overview.metrics"),
    getFormatter(),
    getInstanceUsage({ period: METRIC_PERIOD }),
  ])

  const metrics: Metric[] = [
    {
      label: t("organizations"),
      value: format.number(usage.organizations.current),
      ...describeChange(t, format, usage.organizations, "snapshot"),
      detail: t("detail.organizations"),
    },
    {
      label: t("users"),
      value: format.number(usage.users.current),
      ...describeChange(t, format, usage.users, "snapshot"),
      detail: t("detail.users"),
    },
    {
      label: t("signIns"),
      value: format.number(usage.signIns.current),
      ...describeChange(t, format, usage.signIns),
      detail: t("detail.instanceSignIns"),
    },
    {
      label: t("activeUsers"),
      value: format.number(usage.activeUsers.current, {
        maximumFractionDigits: 1,
      }),
      ...describeChange(t, format, usage.activeUsers),
      detail: t("detail.dailyAverage"),
    },
  ]

  return (
    <MetricGrid>
      {metrics.map((metric) => (
        <MetricCard key={metric.label} metric={metric} href={usageHref} />
      ))}
    </MetricGrid>
  )
}

// Daily sign-ins over the last month: the tenant's, or the instance's on root.
export async function SignInActivity({
  organizationId,
  usageHref,
}: {
  // Omitted for the instance, which only root administration may read.
  organizationId?: string
  usageHref: string
}) {
  const [t, usage] = await Promise.all([
    getTranslations("app.overview.activity"),
    organizationId
      ? getOrganizationUsage({ organizationId, period: CHART_PERIOD })
      : getInstanceUsage({ period: CHART_PERIOD }),
  ])

  return (
    <ActivityCard
      usageHref={usageHref}
      description={t("description", { count: usage.signIns.current })}
    >
      <ActivityChart
        points={usage.series.map(({ day, signIns }) => ({ day, signIns }))}
      />
    </ActivityCard>
  )
}
