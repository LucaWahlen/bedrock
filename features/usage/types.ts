export const USAGE_PERIODS = [7, 30, 90, 365] as const

export type UsagePeriod = (typeof USAGE_PERIODS)[number]

// Counted from what happened on a day. Recomputing a day from the audit log
// and the token table gives the same answer, which is what makes the rollup
// idempotent.
export const USAGE_EVENT_METRICS = [
  "sign_ins",
  "sign_in_failures",
  "active_users",
  "tokens_issued",
] as const

// Counted the same way, added by the second version of the rollup. A day
// rolled up before them is recounted by the next housekeeping run within
// reach; one beyond it keeps the first version's figures alone.
export const USAGE_DETAIL_METRICS = [
  // Successful sign-ins by how they were proven; subject is the method.
  "sign_in_methods",
  // Refused sign-ins by why; subject is the reason.
  "sign_in_failure_reasons",
  // Successful sign-ins by UTC hour of the day; subject is "0" to "23".
  "sign_ins_by_hour",
  // Distinct people active in the 7 and 30 days ending on the day.
  "weekly_active_users",
  "monthly_active_users",
  // Distinct people receiving a token; subject is the client.
  "application_active_users",
  "members_joined",
  "members_removed",
  // The instance's alone: an account or an organization is not a tenant's.
  "users_created",
  "organizations_created",
] as const

// The version every rolled-up day records on an instance row of its own, so a
// day counted before the detail metrics existed is known to need recounting.
export const USAGE_ROLLUP_MARKER = "rollup_version"
export const USAGE_ROLLUP_VERSION = 2

// The state at the end of a day, which only a run on the following day can
// see. Past days cannot be reconstructed, so a backfill never writes these.
export const ORGANIZATION_SNAPSHOT_METRICS = [
  "members",
  "members_with_second_factor",
  "applications",
  // Subject is the role.
  "members_by_role",
  "invitations_open",
] as const

export const INSTANCE_SNAPSHOT_METRICS = [
  "organizations",
  "users",
  "applications",
  "users_with_second_factor",
  // Subject is the status, deleted organizations awaiting purge included.
  "organizations_by_status",
] as const

export type UsageEventMetric = (typeof USAGE_EVENT_METRICS)[number]

export type UsageDetailMetric = (typeof USAGE_DETAIL_METRICS)[number]

export type UsageMetric =
  | UsageEventMetric
  | UsageDetailMetric
  | typeof USAGE_ROLLUP_MARKER
  | (typeof ORGANIZATION_SNAPSHOT_METRICS)[number]
  | (typeof INSTANCE_SNAPSHOT_METRICS)[number]

export const SIGN_IN_METHODS = ["password", "two_factor", "passkey"] as const

export type SignInMethod = (typeof SIGN_IN_METHODS)[number]

export const SIGN_IN_FAILURE_REASONS = [
  "invalid_credentials",
  "second_factor",
  "passkey",
  "rate_limited",
  "disabled",
  "not_member",
  "suspended",
  "other",
] as const

export type SignInFailureReason = (typeof SIGN_IN_FAILURE_REASONS)[number]

// One counter. A null organization is the instance; a null subject is the
// metric's own total rather than one client's share of it.
export type UsageRow = {
  organizationId: string | null
  metric: UsageMetric
  subjectId: string | null
  value: number
}

// Null on a day housekeeping has not rolled up, which is unknown, not zero.
export type UsagePoint = {
  // An ISO date, UTC.
  day: string
  signIns: number | null
  activeUsers: number | null
}

// A total over the period and the one before it. `previous` is null when no
// day of the previous period was rolled up, so there is nothing to compare.
export type UsageComparison = {
  current: number
  previous: number | null
}

export type UsageCoverage = {
  // Days of the period, today excluded, that housekeeping has rolled up.
  rolledUpDays: number
  // Days of the period before today.
  pastDays: number
}

export type OrganizationUsageInput = {
  organizationId: string
  period: UsagePeriod
}

export type ApplicationTokenUsage = {
  clientId: string
  // Null once the application has been deleted.
  name: string | null
  tokens: number
}

export type OrganizationUsage = {
  period: UsagePeriod
  series: UsagePoint[]
  coverage: UsageCoverage
  signIns: UsageComparison
  // A daily average: distinct people are not additive across days.
  activeUsers: UsageComparison
  tokensIssued: UsageComparison
  secondFactor: {
    members: number
    withSecondFactor: number
    // The share at the end of the day before the period, when recorded.
    previousRate: number | null
  }
  applications: ApplicationTokenUsage[]
}

export type InstanceUsageInput = {
  period: UsagePeriod
}

export type OrganizationActivity = {
  id: string
  name: string
  slug: string
  // A daily average over the period, like the stat it ranks by.
  activeUsers: number
  signIns: number
}

export type InstanceUsage = {
  period: UsagePeriod
  series: UsagePoint[]
  coverage: UsageCoverage
  organizations: UsageComparison
  users: UsageComparison
  signIns: UsageComparison
  activeUsers: UsageComparison
  topOrganizations: OrganizationActivity[]
}

// The detailed reports behind the Usage pages. Every series has one point per
// day of the period; null marks a day not rolled up, never a quiet one.

export type ActivityPoint = {
  day: string
  signIns: number | null
  activeUsers: number | null
  failures: number | null
}

export type EngagementPoint = {
  day: string
  daily: number | null
  weekly: number | null
  monthly: number | null
}

export type RatePoint = {
  day: string
  // A share between 0 and 1; null where no end-of-day snapshot was taken.
  rate: number | null
}

// A share between 0 and 1 over the period and the one before it. Either is
// null when there was nothing to take a share of, or nothing recorded.
export type UsageRate = {
  current: number | null
  previous: number | null
}

export type CountPoint = {
  day: string
  value: number | null
}

export type GrowthPoint = {
  day: string
  joined: number | null
  removed: number | null
}

export type Breakdown<K extends string = string> = {
  key: K
  value: number
}[]

export type UsageAuthentication = {
  methods: Breakdown<SignInMethod>
  failureReasons: Breakdown<SignInFailureReason>
  secondFactorTrend: RatePoint[]
}

// Successful sign-ins by weekday, Monday first, then by UTC hour.
export type SignInHeatmap = number[][]

export type UsageReportBase = {
  period: UsagePeriod
  today: string
  // The lesser of what the headline and the detailed figures have rolled up.
  coverage: UsageCoverage
  signIns: UsageComparison
  activeUsers: UsageComparison
  weeklyActiveUsers: UsageComparison
  // Daily active users over monthly ones, averaged over the period.
  stickiness: UsageRate
  successRate: UsageRate
  secondFactorRate: UsageRate
  // Members, or accounts on the instance, holding a second factor now.
  secondFactor: { holders: number; total: number }
  activity: ActivityPoint[]
  engagement: EngagementPoint[]
  authentication: UsageAuthentication
  heatmap: SignInHeatmap
}

export type ApplicationUsage = {
  clientId: string
  // Null once the application has been deleted.
  name: string | null
  tokens: UsageComparison
  // People receiving a token on an average day.
  activeUsers: number
  // Tokens per day, unknown days at zero, for a sparkline.
  trend: number[]
}

export type InvitationFunnel = {
  sent: number
  accepted: number
  open: number
  revoked: number
  expired: number
}

export type OrganizationUsageReport = UsageReportBase & {
  tokensIssued: UsageComparison
  newMembers: UsageComparison
  membersRemoved: number
  members: number
  growth: GrowthPoint[]
  roles: Breakdown
  invitations: InvitationFunnel & {
    // How long audit events are kept, which bounds what the funnel can see.
    retentionDays: number | null
  }
  applications: ApplicationUsage[]
}

export type OrganizationRanking = {
  id: string
  name: string
  slug: string
  status: "active" | "suspended"
  activeUsers: number
  signIns: UsageComparison
  tokens: number
  // Sign-ins per day, unknown days at zero, for a sparkline.
  trend: number[]
}

export type InstanceUsageReport = UsageReportBase & {
  organizations: UsageComparison
  users: UsageComparison
  newUsers: UsageComparison
  newOrganizations: number
  userGrowth: CountPoint[]
  organizationStatus: Breakdown<"active" | "suspended" | "deleted">
  topOrganizations: OrganizationRanking[]
}
