import { Crown, ShieldUser, User, type LucideIcon } from "lucide-react"

import { MEMBER_ROLES, type MemberRole } from "@/features/organizations/types"

// Single source for how a role looks, so a badge and a filter option cannot
// drift apart. Its label and description are `organizations.roles.<role>`.
export const MEMBER_ROLE_DISPLAY: Record<
  MemberRole,
  {
    icon: LucideIcon
    className: string
  }
> = {
  owner: {
    icon: Crown,
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  admin: {
    icon: ShieldUser,
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  member: {
    icon: User,
    className: "bg-muted text-muted-foreground",
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
