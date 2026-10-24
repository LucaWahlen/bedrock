import { CircleCheck, Pause, Trash2, type LucideIcon } from "lucide-react"

import type { OrganizationStatus } from "@/features/organizations/types"

// Single source for how a status looks, so a table cell, a filter option and
// any future surface cannot drift apart. Its label is
// `organizations.organizationStatus.<status>`.
export const ORGANIZATION_STATUS_DISPLAY: Record<
  OrganizationStatus,
  { icon: LucideIcon; className: string }
> = {
  active: {
    icon: CircleCheck,
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  suspended: {
    icon: Pause,
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  deleted: {
    icon: Trash2,
    className: "bg-destructive/15 text-destructive",
  },
}
