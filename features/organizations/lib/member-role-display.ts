import { Crown, ShieldUser, User, type LucideIcon } from "lucide-react"

import { MEMBER_ROLES, type MemberRole } from "@/features/organizations/types"

// Single source for how a role looks, so a badge and a filter option cannot
// drift apart. Its label and description are `organizations.roles.<role>`.
// Only the icon is tinted: a role is a value like any other in its row, and the
// filled colours belong to the state columns beside it.
export const MEMBER_ROLE_DISPLAY: Record<
  MemberRole,
  {
    icon: LucideIcon
    iconClassName: string
  }
> = {
  owner: {
    icon: Crown,
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  admin: {
    icon: ShieldUser,
    iconClassName: "text-violet-600 dark:text-violet-400",
  },
  member: {
    icon: User,
    iconClassName: "text-muted-foreground",
  },
}

const KNOWN_ROLES: readonly string[] = MEMBER_ROLES

export function isOrganizationRole(role: string): role is MemberRole {
  return KNOWN_ROLES.includes(role)
}

// Most authority first; a role the application does not know keeps its own name
// and goes last.
export function sortRoles(roles: string[]) {
  return roles.toSorted((first, second) => {
    const firstRank = KNOWN_ROLES.indexOf(first)
    const secondRank = KNOWN_ROLES.indexOf(second)

    if (firstRank === secondRank) return first.localeCompare(second)

    return (
      (firstRank === -1 ? KNOWN_ROLES.length : firstRank) -
      (secondRank === -1 ? KNOWN_ROLES.length : secondRank)
    )
  })
}

// The role a member is offered as their current one when several are assigned.
export function primaryRole(roles: string[]): MemberRole {
  return sortRoles(roles).find(isOrganizationRole) ?? "member"
}
