import {
  BadgeCheck,
  CircleDashed,
  MailPlus,
  type LucideIcon,
} from "lucide-react"

import type {
  MemberStatus,
  OrganizationMember,
} from "@/features/organizations/types"

// Single source for how a status looks, so a badge and a filter option cannot
// drift apart. Its label is `organizations.memberStatus.<status>`.
export const MEMBER_STATUS_DISPLAY: Record<
  MemberStatus,
  {
    icon: LucideIcon
    variant: "success" | "muted" | "outline"
    className?: string
  }
> = {
  confirmed: {
    icon: BadgeCheck,
    variant: "success",
  },
  unconfirmed: {
    icon: CircleDashed,
    variant: "muted",
  },
  // Outlined rather than filled: nobody is in the organization yet.
  invited: {
    icon: MailPlus,
    variant: "outline",
    className: "text-muted-foreground",
  },
}

// Being invited outranks the state of the address, because not being in the
// organization yet is the more useful thing to read first.
export function memberStatusOf(member: OrganizationMember): MemberStatus {
  if (member.pending) return "invited"

  return member.emailVerified ? "confirmed" : "unconfirmed"
}
