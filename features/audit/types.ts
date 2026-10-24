export type AuditActorType = "user" | "system" | "anonymous"

export const AUDIT_OUTCOMES = ["success", "failure", "denied"] as const

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number]

export type AuditScope = "tenant" | "platform"

export const ORGANIZATION_AUDIT_ACTIONS = [
  "organization.created",
  "organization.updated",
  "organization.suspended",
  "organization.reactivated",
  "organization.deleted",
  "organization.restored",
  "organization.purged",
  "organization.member_added",
  "organization.member_removed",
  "organization.member_role_changed",
  "organization.member_invited",
  "organization.invitation_resent",
  "organization.invitation_revoked",
  "organization.invitation_accepted",
] as const

export type OrganizationAuditAction =
  (typeof ORGANIZATION_AUDIT_ACTIONS)[number]

// Whether an organization exists at all is the instance's business, not the
// organization's own: only root administration may create, suspend, restore or
// purge one, and a deletion an owner makes from inside is still its lifecycle,
// which root has to be able to see and undo.
export const ORGANIZATION_LIFECYCLE_ACTIONS = [
  "organization.created",
  "organization.suspended",
  "organization.reactivated",
  "organization.deleted",
  "organization.restored",
  "organization.purged",
] as const

export const APPLICATION_AUDIT_ACTIONS = [
  "application.created",
  "application.updated",
  "application.deleted",
  "application.secret_rotated",
  "application.role_created",
  "application.role_updated",
  "application.role_deleted",
  "application.roles_assigned",
  "application.role_members_changed",
  "application.role_groups_changed",
] as const

export type ApplicationAuditAction = (typeof APPLICATION_AUDIT_ACTIONS)[number]

export const GROUP_AUDIT_ACTIONS = [
  "group.created",
  "group.updated",
  "group.deleted",
  "group.members_changed",
  "group.roles_changed",
] as const

export type GroupAuditAction = (typeof GROUP_AUDIT_ACTIONS)[number]

// What a root administrator, or the admin script, does to someone else's
// account. Like an account's own changes, these are the instance's business.
export const USER_AUDIT_ACTIONS = [
  "user.created",
  "user.disabled",
  "user.enabled",
] as const

// What a person does to their own account. An account is one instance-wide
// identity, so these are the instance's business whichever organization's page
// they were done from.
export const ACCOUNT_AUDIT_ACTIONS = [
  "account.profile_updated",
  "account.password_changed",
  "account.email_change_requested",
  "account.email_changed",
  "account.session_revoked",
  "account.sessions_revoked",
  "account.two_factor_enabled",
  "account.two_factor_disabled",
  "account.two_factor_reset",
  "account.backup_codes_regenerated",
  "account.passkey_added",
  "account.passkey_renamed",
  "account.passkey_removed",
  "account.deleted",
] as const

export type AccountAuditAction = (typeof ACCOUNT_AUDIT_ACTIONS)[number]

export const AUTHENTICATION_AUDIT_ACTIONS = [
  "authentication.login",
  // The password was right and a second factor was asked for. The sign-in
  // itself is the `authentication.login` that follows, or does not.
  "authentication.two_factor_challenged",
  "authentication.logout",
  "authentication.email_verified",
  "authentication.password_reset_requested",
  "authentication.password_reset",
] as const

// New domains append their action list here; the column itself stays free-form
// text so adding an action never needs a migration.
export const AUDIT_ACTIONS = [
  ...ORGANIZATION_AUDIT_ACTIONS,
  ...APPLICATION_AUDIT_ACTIONS,
  ...GROUP_AUDIT_ACTIONS,
  ...USER_AUDIT_ACTIONS,
  ...ACCOUNT_AUDIT_ACTIONS,
  ...AUTHENTICATION_AUDIT_ACTIONS,
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditActor =
  | {
      type: "user"
      userId: string
      name?: string | null
      email?: string | null
      organizationId?: string | null
    }
  // An anonymous actor has no name, but a failed sign-in knows the address.
  | {
      type: "system" | "anonymous"
      name?: string | null
      email?: string | null
    }

export type AuditEventInput = {
  action: AuditAction
  actor: AuditActor
  outcome?: AuditOutcome
  organization?: {
    id: string | null
    name?: string | null
    slug?: string | null
  }
  target?: { type: string; id: string; label?: string | null }
  reason?: string | null
  metadata?: Record<string, unknown>
}

// Every subject of an event is two things: a statement of what was true when it
// happened, and a reference resolved against the subject as it is now. They are
// kept apart so neither can silently stand in for the other.
export type AuditEventActor = {
  type: AuditActorType
  id: string | null
  // As recorded when the event happened.
  name: string | null
  email: string | null
  // Resolved now. Null for a user that no longer exists, and for system and
  // anonymous actors, which never had one.
  current: { name: string; email: string; image: string | null } | null
  // True when the actor acted from the root organization rather than from the
  // organization the event belongs to.
  isRootActor: boolean
  isDeleted: boolean
}

export type AuditEventOrganization = {
  id: string | null
  // As recorded when the event happened.
  name: string
  slug: string | null
  // Resolved now. Null when the organization no longer exists.
  current: {
    name: string
    slug: string | null
    logo: string | null
    isRoot: boolean
  } | null
  isDeleted: boolean
}

export type AuditEventDisplay = {
  id: string
  createdAt: string
  action: string
  outcome: AuditOutcome
  actor: AuditEventActor
  organization: AuditEventOrganization | null
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  reason: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
}

export type AuditLogAccess = {
  canView: boolean
  // Reads the instance log, and is entitled to see which person acted for the
  // platform rather than the platform itself.
  isRootAdministrator: boolean
}

export type AuditEventFacet = {
  value: string
  label: string
  description: string | null
  image: string | null
  count: number
}

export type AuditEventsQuery = {
  // Omit to read the instance-wide log, which only root administrators may do.
  organizationId?: string
  search?: string
  actions?: AuditAction[]
  outcomes?: AuditOutcome[]
  actorIds?: string[]
  organizationIds?: string[]
  direction?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export type AuditEventsResult = {
  events: AuditEventDisplay[]
  total: number
  page: number
  pageSize: number
  actionCounts: Partial<Record<AuditAction, number>>
  outcomeCounts: Record<AuditOutcome, number>
  actorFacets: AuditEventFacet[]
  organizationFacets: AuditEventFacet[]
}
