export type ApplicationRoleSummary = {
  id: string
  key: string
  name: string
}

export type ApplicationSummary = {
  clientId: string
  name: string
  icon: string | null
}

export type RoleMember = {
  id: string
  name: string
  email: string
  image: string | null
}

// What a relying party has to be told to talk to this instance. Derived on the
// server, since the base URL lives in configuration the browser never sees.
export type OidcConfiguration = {
  issuer: string
  discovery: string
  authorization: string
  token: string
  jwks: string
  userinfo: string
  endSession: string
  signingAlgorithm: string
  scopes: string[]
}

export type Application = {
  clientId: string
  name: string
  redirectUris: string[]
  postLogoutRedirectUris: string[]
  uri: string | null
  icon: string | null
  // A trusted first-party application is not asked for consent.
  skipConsent: boolean
  disabled: boolean
  // Derived from the registered authentication method, not stored separately.
  isConfidential: boolean
  createdAt: string | null
  roles: ApplicationRoleSummary[]
}

// The root organization's view: the same application plus who owns it. Root
// administration can read this and nothing more, since running the instance is
// not membership of the tenant that registered it.
export type InstanceApplication = Application & {
  organization: {
    id: string
    name: string
    slug: string
    logo: string | null
  }
}

// A group that grants a role to everyone in it.
export type RoleGroupSummary = {
  id: string
  key: string
  name: string
}

// Every group of the organization, offered when choosing which grant a role.
export type RoleGroupOption = RoleGroupSummary & {
  description: string | null
}

// A role as one member holds it: given to them directly, granted by groups
// they are in, or both. Only a direct assignment can be taken away on its own.
export type HeldApplicationRole = ApplicationRoleSummary & {
  direct: boolean
  // The groups granting it, empty when it is held directly alone.
  groups: RoleGroupSummary[]
}

// Someone who holds a role, and how, from the role's side.
export type RoleHolder = RoleMember & {
  direct: boolean
  groups: RoleGroupSummary[]
}

export type ApplicationRole = {
  id: string
  key: string
  name: string
  description: string | null
  applications: ApplicationSummary[]
  // Everyone who holds it, directly or through a group, as a token would.
  memberCount: number
  // Those given it directly, the only ones its members dialog can remove.
  directMemberCount: number
  // Those holding it through at least one group, whether or not also directly.
  groupMemberCount: number
  memberPreview: RoleMember[]
  groups: RoleGroupSummary[]
  createdAt: string
}

// Every role of an organization, for pickers and filters rather than a table.
export type ApplicationRoleOption = ApplicationRoleSummary & {
  description: string | null
  // Effective holders, directly or through a group.
  memberCount: number
}

export const APPLICATION_TYPES = ["confidential", "public"] as const

export type ApplicationType = (typeof APPLICATION_TYPES)[number]

export const APPLICATION_SORTS = ["name", "createdAt"] as const

export type ApplicationSort = (typeof APPLICATION_SORTS)[number]

export const APPLICATION_ROLE_SORTS = ["name", "createdAt"] as const

export type ApplicationRoleSort = (typeof APPLICATION_ROLE_SORTS)[number]

type ListQuery<TSort> = {
  search?: string
  sort?: TSort
  direction?: "asc" | "desc"
  page?: number
  pageSize?: number
}

type ListResult = {
  total: number
  page: number
  pageSize: number
}

export type ApplicationsQuery = ListQuery<ApplicationSort> & {
  organizationId: string
  types?: ApplicationType[]
}

export type ApplicationsResult = ListResult & {
  applications: Application[]
  typeCounts: Record<ApplicationType, number>
}

export type InstanceApplicationsQuery = ListQuery<ApplicationSort> & {
  types?: ApplicationType[]
}

export type InstanceApplicationsResult = ListResult & {
  applications: InstanceApplication[]
  typeCounts: Record<ApplicationType, number>
}

export type ApplicationRolesQuery = ListQuery<ApplicationRoleSort> & {
  organizationId: string
  clientIds?: string[]
}

export type ApplicationRolesResult = ListResult & {
  roles: ApplicationRole[]
  // Keyed by client id, over the search but not over the selection.
  applicationCounts: Record<string, number>
}

export type CreateApplicationInput = {
  organizationId: string
  name: string
  redirectUris: string[]
  postLogoutRedirectUris?: string[]
  uri?: string | null
  // A client that cannot keep a secret, such as a browser or mobile app.
  isPublic?: boolean
  skipConsent?: boolean
  // A staging key from the upload endpoint, promoted once the client exists.
  icon?: { key: string } | null
}

export type UpdateApplicationInput = {
  organizationId: string
  clientId: string
  name: string
  redirectUris: string[]
  postLogoutRedirectUris?: string[]
  uri?: string | null
  skipConsent?: boolean
  // Absent leaves the icon alone; null removes it; a key replaces it.
  icon?: { key: string } | null
}

// The secret is returned once, at creation and at rotation, and is only ever
// stored hashed.
export type ApplicationSecretResult =
  | { success: true; clientId: string; clientSecret: string | null }
  | { success: false; error: string }

export type ApplicationRoleInput = {
  organizationId: string
  key: string
  name: string
  description?: string | null
  clientIds: string[]
  // Only when creating; an existing role's holders change through setRoleMembers.
  memberUserIds?: string[]
}

export type SetMemberRolesInput = {
  organizationId: string
  userId: string
  roleIds: string[]
}

export type SetRoleMembersInput = {
  organizationId: string
  roleId: string
  add: string[]
  remove: string[]
}

export type SetRoleGroupsInput = {
  organizationId: string
  roleId: string
  groupIds: string[]
}

// An application the signed-in member can sign into, as their overview shows
// it. Only the roles this member holds are listed, never anyone else's.
export type MemberApplication = {
  clientId: string
  name: string
  icon: string | null
  // Null when none is set, or when the stored one is not safe to link to.
  launchUrl: string | null
  roles: ApplicationRoleSummary[]
}

export type ApplicationSummaryCounts = {
  applications: number
  roles: number
}

export type InstanceApplicationCounts = {
  applications: number
}
