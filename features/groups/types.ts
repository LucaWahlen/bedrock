export type GroupSummary = {
  id: string
  key: string
  name: string
}

// Every group of an organization, for pickers and filters rather than a table.
export type GroupOption = GroupSummary & {
  description: string | null
  memberCount: number
  // What joining it grants, so a picker can say so.
  roles: GroupRoleSummary[]
}

export type GroupMember = {
  id: string
  name: string
  email: string
  image: string | null
}

export type GroupRoleSummary = {
  id: string
  key: string
  name: string
}

export type Group = {
  id: string
  key: string
  name: string
  description: string | null
  memberCount: number
  memberPreview: GroupMember[]
  roles: GroupRoleSummary[]
  createdAt: string
}

export const GROUP_SORTS = ["name", "createdAt"] as const

export type GroupSort = (typeof GROUP_SORTS)[number]

export type GroupsQuery = {
  organizationId: string
  search?: string
  roleIds?: string[]
  sort?: GroupSort
  direction?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export type GroupsResult = {
  groups: Group[]
  total: number
  page: number
  pageSize: number
  // Keyed by role id, over the search but not over the selection.
  roleCounts: Record<string, number>
}

export type GroupInput = {
  organizationId: string
  key: string
  name: string
  description?: string | null
  // Only when creating; an existing group changes through setGroupMembers and
  // setGroupRoles.
  memberUserIds?: string[]
  roleIds?: string[]
}

export type SetGroupMembersInput = {
  organizationId: string
  groupId: string
  add: string[]
  remove: string[]
}

// Replaces every group one member is in, from the member's side.
export type SetMemberGroupsInput = {
  organizationId: string
  userId: string
  groupIds: string[]
}

export type SetGroupRolesInput = {
  organizationId: string
  groupId: string
  roleIds: string[]
}
