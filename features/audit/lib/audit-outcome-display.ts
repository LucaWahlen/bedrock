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
  { icon: LucideIcon; variant: "success" | "warning" | "destructive" }
> = {
  success: { icon: CircleCheck, variant: "success" },
  failure: { icon: TriangleAlert, variant: "destructive" },
  denied: { icon: CircleSlash, variant: "warning" },
}
