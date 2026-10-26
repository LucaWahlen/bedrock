import type { HeldApplicationRole } from "@/features/applications"
import type { GroupSummary } from "@/features/groups"
import { organizationStatus } from "@/features/shared/lib/db/schema"

export const ORGANIZATION_STATUSES = organizationStatus.enumValues

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number]

// What the organization list needs to explain a non-active status.
export type OrganizationStatusChange = {
  actorName: string | null
  changedAt: string
}

export const ORGANIZATION_SORTS = ["name", "createdAt"] as const

export type OrganizationSort = (typeof ORGANIZATION_SORTS)[number]

export type Organization = {
  id: string
  name: string
  slug: string
  logo?: string | null
  isRoot: boolean
  status: OrganizationStatus
  color?: string | null
  backgroundImage?: string | null
  favicon?: string | null
  allowPublicSignUp?: boolean
  requireTwoFactor?: boolean
}

export type OrganizationPerson = {
  id: string
  name: string
  email: string
  image?: string | null
}

export type OrganizationPeopleEntry = OrganizationPerson & {
  roles: string[]
}

export type OrganizationPeopleKind = "members" | "administrators"

export type OrganizationDisplay = {
  id: string
  name: string
  slug: string
  logo?: string | null
  isRoot: boolean
  status: OrganizationStatus
  createdAt: string
  // Derived from the deletion and the retention setting on the server, because
  // the setting must not reach the browser.
  purgeScheduledFor: string | null
  lastStatusChange: OrganizationStatusChange | null
  administratorCount: number
  administratorPreview: OrganizationPerson[]
  // Plain members only, so the two columns partition the organization.
  memberCount: number
  memberPreview: OrganizationPerson[]
}

export type OrganizationsQuery = {
  search?: string
  statuses?: OrganizationStatus[]
  sort?: OrganizationSort
  direction?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export type OrganizationsResult = {
  organizations: OrganizationDisplay[]
  total: number
  page: number
  pageSize: number
  statusCounts: Record<OrganizationStatus, number>
}

export type CreateOrganizationInput = {
  name: string
  slug: string
  color: string
  ownerIds: string[]
  logo?: { key: string }
  backgroundImage?: { key: string }
  favicon?: { key: string }
}

export type CreateOrganizationResult =
  | { success: true; slug: string; isMember: boolean }
  | { success: false; error: string }

// What is to become of one branding image. On update, absence cannot mean
// "leave it alone" and "clear it" at once, so the caller says which.
export type MediaUpdate =
  | { action: "keep" }
  | { action: "replace"; key: string }
  | { action: "remove" }

// Each block of the settings page saves on its own, so an absent field means
// that block did not ask for it rather than that it should be cleared.
export type UpdateOrganizationInput = {
  organizationId: string
  name?: string
  slug?: string
  color?: string
  allowPublicSignUp?: boolean
  requireTwoFactor?: boolean
  logo?: MediaUpdate
  backgroundImage?: MediaUpdate
  favicon?: MediaUpdate
}

// The slug is returned because changing it moves the page the caller is on.
export type UpdateOrganizationResult =
  | { success: true; slug: string }
  | { success: false; error: string }

// What the server decided the viewer may do here, so the page renders controls
// from a capability rather than re-deriving one from a role string.
export type OrganizationSettingsCapabilities = {
  canEditProfile: boolean
  // Externally visible, and an owner's to change.
  canChangeSlug: boolean
  // Deleting is an owner's last word on their own organization. Suspending is
  // the instance's alone, so it is not a capability a tenant page can hold.
  canDeleteOrganization: boolean
}

// Which second factors a member holds. Either is enough: a passkey is phishing
// resistant on its own, and TOTP follows a password.
export type SecondFactorStatus = {
  totp: boolean
  passkeys: number
}

export type MemberSecondFactor = SecondFactorStatus & {
  userId: string
  name: string
  email: string
  image: string | null
  roles: string[]
  // A disabled account cannot sign in at all, so it is not counted as owing a
  // second factor.
  disabled: boolean
  isSelf: boolean
}

// The tenant's Authentication page: how someone gets in, and who among its
// members would be turned away if a second factor were required.
export type OrganizationAuthentication = {
  allowPublicSignUp: boolean
  requireTwoFactor: boolean
  members: MemberSecondFactor[]
  memberCount: number
  // Active members holding neither TOTP nor a passkey.
  nonCompliantCount: number
  // Whether the viewer could turn the requirement on without locking
  // themselves out.
  viewerHasSecondFactor: boolean
  capabilities: {
    canChangeSignUp: boolean
    // Like the slug, an owner's alone.
    canRequireTwoFactor: boolean
  }
}

export const PEOPLE_SORTS = ["name", "createdAt", "lastActiveAt"] as const

export type PeopleSort = (typeof PEOPLE_SORTS)[number]

// Ordered by authority, which is also the order roles are offered and listed
// in. It is declared here rather than imported from `features/auth`, whose
// barrel carries the Better Auth server and must stay out of client bundles;
// `set-member-role` assigns this list to `OrganizationRole[]`, so the two
// cannot drift apart unnoticed.
export const MEMBER_ROLES = ["owner", "admin", "member"] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]

// Belonging to the root organization is administering the instance, so it has
// no plain members. `scripts/admin` offers the same two roles.
export const ROOT_MEMBER_ROLES = ["owner", "admin"] as const

// Somebody to be given access: an account that already exists, or an address
// that has none yet and so can only be invited.
export type PersonSelection =
  | ({ kind: "user" } & OrganizationPerson)
  | { kind: "address"; email: string }

// Anyone named who already belonged is skipped rather than refused, so the
// counts are what the caller reports back.
export type AddMembersResult =
  | { success: true; added: number; skipped: number }
  | { success: false; error: string }

export type AddPeopleInput = {
  organizationId: string
  userIds: string[]
  emails: string[]
  role: MemberRole
  // Ignored when an address has no account, because there is nobody to add.
  invite: boolean
}

export type AddPeopleResult =
  | {
      success: true
      added: number
      invited: number
      skipped: number
      // The invitation exists either way; whether its mail left does not.
      undelivered: number
      // One line per address that could not be invited, and why.
      refused: string[]
    }
  | { success: false; error: string }

// A filter option counted over the current search, without its own selection
// narrowing it.
export type PeopleFacet = {
  value: string
  label: string
  description: string | null
  image: string | null
  count: number
}

// One person's membership of one organization, as either side of it reads it.
export type Membership = {
  organizationId: string
  name: string
  slug: string
  logo: string | null
  isRoot: boolean
  // Better Auth keeps several roles in one column, so this is a list.
  roles: string[]
  joinedAt: string
}

// What the server decided the viewer may do, so the table renders controls from
// a capability rather than re-deriving one from a role string.
export type MemberCapabilities = {
  canManageMembers: boolean
  // Granting and revoking ownership is a narrower right than managing members.
  canManageOwners: boolean
  // A root administrator picks members from the directory; anyone else has to
  // name an address exactly, so a tenant cannot enumerate it.
  canSearchDirectory: boolean
  // Root owns no applications, so this is never true there.
  canManageApplicationRoles: boolean
  // Whether members hold a second factor is their administrators' business,
  // not every member's.
  canViewSecondFactors: boolean
}

// An invitation nobody has answered yet. There is no other kind: accepting,
// withdrawing or letting one lapse removes it.
export type PendingInvitation = {
  lastSentAt: string
  expiresAt: string
  inviterName: string | null
}

type PersonRow = {
  id: string
  email: string
  emailVerified: boolean
  image: string | null
  roles: string[]
  // Joined, for a member; invited, for one who has not answered.
  addedAt: string
  lastActiveAt: string | null
  isSelf: boolean
}

export type JoinedMember = PersonRow & {
  pending: null
  userId: string
  name: string
  // Every role held, directly or through a group, as a token would carry it.
  // Empty unless the viewer may manage application roles.
  applicationRoles: HeldApplicationRole[]
  // Empty unless the viewer may manage application roles, which groups grant.
  groups: GroupSummary[]
  // Null unless the viewer may see members' second factors.
  secondFactor: SecondFactorStatus | null
}

// An address invited to the organization, which holds no membership yet and has
// a user only if it already had an account.
export type InvitedMember = PersonRow & {
  pending: PendingInvitation
  userId: string | null
  name: string | null
}

// The members list answers one question — who is in this organization — so an
// invitation nobody has answered is a row in it, not a separate page. The facet
// is what narrows it back down.
export type OrganizationMember = JoinedMember | InvitedMember

// Exactly one of these is true of a row, which is what lets one column and one
// filter carry both whether somebody is in and whether their address is proven.
export const MEMBER_STATUSES = ["confirmed", "unconfirmed", "invited"] as const

export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export type OrganizationMembersQuery = {
  organizationId: string
  search?: string
  roles?: MemberRole[]
  statuses?: MemberStatus[]
  // Matched against effective roles, held directly or through a group.
  applicationRoleIds?: string[]
  groupIds?: string[]
  sort?: PeopleSort
  direction?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export type OrganizationMembersResult = {
  members: OrganizationMember[]
  total: number
  page: number
  pageSize: number
  roleCounts: Record<MemberRole, number>
  statusCounts: Record<MemberStatus, number>
  // Keyed by role and group id, over the search but not over the selection.
  // Empty unless the viewer may manage application roles.
  applicationRoleCounts: Record<string, number>
  groupCounts: Record<string, number>
  capabilities: MemberCapabilities
}

export type DirectoryPerson = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: string
  lastActiveAt: string | null
  organizationCount: number
  organizationPreview: Membership[]
  // Disabled accounts cannot sign in anywhere until a root administrator
  // enables them again.
  disabled: { at: string; reason: string | null } | null
  // Whether there is an authenticator a root administrator could reset.
  twoFactorEnabled: boolean
  isSelf: boolean
}

export type DirectoryQuery = {
  search?: string
  organizationIds?: string[]
  statuses?: AccountStatus[]
  sort?: PeopleSort
  direction?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export type DirectoryResult = {
  people: DirectoryPerson[]
  total: number
  page: number
  pageSize: number
  organizationFacets: PeopleFacet[]
  statusCounts: Record<AccountStatus, number>
}

export type InviteMemberInput = {
  organizationId: string
  email: string
  role: MemberRole
}

export type InviteMemberResult =
  | { success: true; delivered: boolean }
  | { success: false; error: string }

// Why an invitation link cannot be used, kept apart from the invitation itself
// so the page can explain the refusal rather than only deny it. A withdrawn or
// already accepted one is simply gone, and reads as unknown.
export const INVITATION_REFUSALS = [
  "unknown",
  "expired",
  "organization_unavailable",
  "already_member",
  "unconfirmed_address",
] as const

export type InvitationRefusal = (typeof INVITATION_REFUSALS)[number]

// Who is holding the link. The page has to offer a different way forward for
// each, and offering the wrong one strands them: a stranger sent to the login
// page is refused there for not yet being a member.
export const INVITATION_VIEWERS = ["anonymous", "recipient", "other"] as const

export type InvitationViewer = (typeof INVITATION_VIEWERS)[number]

// What an unauthenticated visitor is allowed to learn from a token they hold.
export type InvitationPreview = {
  email: string
  role: MemberRole
  organizationName: string
  organizationSlug: string
  organizationLogo: string | null
  inviterName: string | null
  expiresAt: string
  // Whether the recipient must create an account or merely sign in to accept.
  hasAccount: boolean
  viewer: InvitationViewer
  // Set only when the visitor is signed in as somebody else.
  signedInAs: string | null
}

export type InvitationLookup =
  | { success: true; invitation: InvitationPreview }
  | { success: false; refusal: InvitationRefusal }

export type AcceptInvitationResult =
  // `two-factor` when the password was right but the account still owes its
  // second factor: nothing has been accepted yet.
  | { success: true; slug: string; next?: "two-factor" }
  | { success: false; error: string }

// What someone accepting an invitation still has to supply: the address is
// already settled by the token they followed.
export type AccountDetailsInput = {
  name: string
  password: string
}

// Another organization the signed-in person belongs to, for the overview's
// shortcuts. Only active organizations are listed, since nothing else admits
// anyone.
export type MemberOrganization = {
  id: string
  name: string
  slug: string
  logo: string | null
  isRoot: boolean
  // The highest-ranking organization role held there.
  role: MemberRole
}

export type PendingInvitationSummary = {
  id: string
  email: string
  role: MemberRole
  expiresAt: string
}

// One organization's membership at a glance, for its administrators.
export type MembershipSummary = {
  members: number
  pendingInvitations: number
  // The soonest to expire first, so the list is what needs attention.
  invitations: PendingInvitationSummary[]
}

// The instance at a glance, for root administrators.
export type InstanceSummary = {
  organizations: Record<OrganizationStatus, number>
  users: { total: number; unverified: number }
}

// Whether an account may sign in at all. Disabling is the instance's sanction on
// one person, as suspension is on one organization.
export const ACCOUNT_STATUSES = ["active", "disabled"] as const

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

// A tenant left without an active owner if this account were disabled. Allowed,
// because disabling is reversible, but said out loud first.
export type OwnedOrganization = {
  id: string
  name: string
  slug: string
}

export type DisableAccountInput = {
  userId: string
  reason: string
}

// What the confirmation dialog warns about before anything happens.
export type AccountDisablePreview = {
  name: string
  email: string
  disabled: boolean
  soleOwnedOrganizations: OwnedOrganization[]
  // Why it would be refused outright, so the dialog does not offer it.
  refusal: string | null
}

export type DisableAccountResult =
  | { success: true; soleOwnedOrganizations: OwnedOrganization[] }
  | { success: false; error: string }

export type StartBreakGlassInput = {
  organizationId: string
  reason: string
}

export type StartBreakGlassResult =
  | { success: true; slug: string }
  | { success: false; error: string }
