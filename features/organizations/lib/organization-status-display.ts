import { CircleCheck, Pause, Trash2, type LucideIcon } from "lucide-react"

import type { OrganizationStatus } from "@/features/organizations/types"

// Single source for how a status looks, so a table cell, a filter option and
// any future surface cannot drift apart. Its label is
// `organizations.organizationStatus.<status>`.
export const ORGANIZATION_STATUS_DISPLAY: Record<
  OrganizationStatus,
  { icon: LucideIcon; variant: "success" | "warning" | "destructive" }
> = {
  active: { icon: CircleCheck, variant: "success" },
  suspended: { icon: Pause, variant: "warning" },
  deleted: { icon: Trash2, variant: "destructive" },
}
