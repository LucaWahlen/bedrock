import { useTranslations } from "next-intl"

import type { HealthStatus } from "@/features/health/types"
import { cn } from "@/features/shared/lib/ui/utils"

// Colour is never the only signal: the status is also named for screen
// readers, and every row says what it found in words.
export function HealthStatusDot({
  status,
  size = "default",
}: {
  status: HealthStatus | "never" | "pending"
  size?: "default" | "sm"
}) {
  const t = useTranslations("health.status")

  return (
    <span className="flex shrink-0 items-center">
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full",
          size === "sm" ? "size-1.5" : "size-2.5",
          status === "ok" && "bg-emerald-500",
          status === "warning" && "bg-amber-500",
          status === "error" && "bg-destructive",
          status === "never" && "bg-muted-foreground/40",
          status === "pending" && "animate-pulse bg-muted-foreground/40"
        )}
      />
      <span className="sr-only">{t(status)}</span>
    </span>
  )
}
