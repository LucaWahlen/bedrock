import { useTranslations } from "next-intl"
import { Suspense, type ReactNode } from "react"

import { ActivityCard } from "@/features/app/components/overview/activity-card"
import { OverviewSection } from "@/features/app/components/overview/overview-section"
import {
  InstanceMetrics,
  OrganizationMetrics,
  PendingInvitations,
  RecentActivity,
  SignInActivity,
  YourApplications,
  YourOrganizations,
} from "@/features/app/components/overview/overview-sections"
import {
  ChartSkeleton,
  ListSkeleton,
  MetricGridSkeleton,
  TileSkeleton,
} from "@/features/app/components/overview/skeletons"
import type { AppCapability } from "@/features/app/types"
import {
  getMembershipSummary,
  type Organization,
} from "@/features/organizations"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

type OverviewDashboardProps = {
  organization: Pick<Organization, "id" | "slug" | "isRoot">
  // Server-computed, and only choose what to render. Every section's read
  // still checks the caller on its own.
  capabilities: readonly AppCapability[]
  // Reserved for a prompt to strengthen the account's sign-in, shown above
  // everything else when the page has one to make.
  accountNudge?: ReactNode
}

export function OverviewDashboard({
  organization,
  capabilities,
  accountNudge,
}: OverviewDashboardProps) {
  const t = useTranslations("app")
  const granted = new Set(capabilities)
  const basePath = `/org/${organization.slug}`
  const usageHref = `${basePath}/usage`
  const manages = granted.has("manageOrganization")
  // Root's figures are the instance's and a tenant's are its own; the usage
  // page draws the same line.
  const showsInstanceMetrics =
    organization.isRoot && granted.has("administerInstance")
  const showsOrganizationMetrics = !organization.isRoot && manages
  const membershipSummary = manages
    ? getMembershipSummary(organization.id)
    : null
  const activityScope = organization.isRoot ? undefined : organization.id

  const metrics = (showsInstanceMetrics || showsOrganizationMetrics) && (
    <>
      <Suspense fallback={<MetricGridSkeleton />}>
        {showsInstanceMetrics ? (
          <InstanceMetrics usageHref={usageHref} />
        ) : (
          <OrganizationMetrics
            organizationId={organization.id}
            usageHref={usageHref}
          />
        )}
      </Suspense>
      <Suspense
        fallback={
          <ActivityCard
            usageHref={usageHref}
            description={<Skeleton className="my-0.5 h-4 w-48" />}
          >
            <ChartSkeleton />
          </ActivityCard>
        }
      >
        <SignInActivity organizationId={activityScope} usageHref={usageHref} />
      </Suspense>
    </>
  )

  // Root registers no applications of its own.
  const applications = !organization.isRoot && (
    <OverviewSection
      title={t("overview.yourApplications")}
      link={
        manages
          ? {
              href: `${basePath}/applications`,
              label: t("navigation.items.applications"),
            }
          : undefined
      }
    >
      <Suspense fallback={<TileSkeleton count={2} />}>
        <YourApplications
          organizationId={organization.id}
          manageHref={manages ? `${basePath}/applications` : undefined}
        />
      </Suspense>
    </OverviewSection>
  )

  const activity = granted.has("viewAuditLog") && (
    <OverviewSection
      title={t(
        organization.isRoot
          ? "overview.recentPlatformActivity"
          : "overview.recentActivity"
      )}
      link={{
        href: `${basePath}/audit-log`,
        label: t("navigation.items.auditLog"),
      }}
    >
      <Suspense fallback={<ListSkeleton rows={5} />}>
        {/* Root's log is the instance's, as on the audit log page. */}
        <RecentActivity organizationId={activityScope} />
      </Suspense>
    </OverviewSection>
  )

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:gap-6">
        {accountNudge}
        {metrics}

        {/* Two independent columns, so a short card never leaves a hole
            beside a long one. */}
        <div className="grid items-start gap-4 md:gap-6 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:col-span-2">
            {applications}
            {activity}
          </div>
          <div className="flex min-w-0 flex-col gap-4 md:gap-6">
            <OverviewSection title={t("overview.yourOrganizations")}>
              <Suspense fallback={<ListSkeleton rows={2} />}>
                <YourOrganizations organizationId={organization.id} />
              </Suspense>
            </OverviewSection>

            {membershipSummary && (
              <OverviewSection
                title={t("overview.pendingInvitations")}
                link={{
                  href: `${basePath}/members?status=invited`,
                  label: t("navigation.items.members"),
                }}
              >
                <Suspense fallback={<ListSkeleton rows={2} />}>
                  <PendingInvitations summary={membershipSummary} />
                </Suspense>
              </OverviewSection>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
