import {
  CircleCheck,
  CircleSlash,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"

import type { AuditOutcome } from "@/features/audit/types"

// Single source for how an outcome looks, shared by the table cell and the
// filter options. It reads as `audit.outcomes.<outcome>`.
export const AUDIT_OUTCOME_DISPLAY: Record<
  AuditOutcome,
  { icon: LucideIcon; className: string }
> = {
  success: {
    icon: CircleCheck,
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  failure: {
    icon: TriangleAlert,
    className: "bg-destructive/15 text-destructive",
  },
  denied: {
    icon: CircleSlash,
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
}
