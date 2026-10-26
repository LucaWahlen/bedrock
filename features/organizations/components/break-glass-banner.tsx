"use client"

import { ShieldAlert } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { endBreakGlass } from "@/features/organizations/actions/end-break-glass"
import { Button } from "@/features/shared/components/ui/button"

type BreakGlassBannerProps = {
  organizationId: string
  organizationName: string
  expiresAt: string
  reason: string
  // Where ending it leaves the administrator: root's own organizations list.
  returnTo: string
}

// Always on screen while root acts as an owner, so nobody forgets they are
// inside someone else's organization.
export function BreakGlassBanner({
  organizationId,
  organizationName,
  expiresAt,
  reason,
  returnTo,
}: BreakGlassBannerProps) {
  const t = useTranslations("organizations.breakGlass.banner")
  const format = useFormatter()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function end() {
    startTransition(async () => {
      const result = await endBreakGlass(organizationId)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(t("ended"))
      router.push(returnTo)
    })
  }

  return (
    <aside
      aria-label={t("title")}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100"
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{t("title")}</span>{" "}
        {t("description", {
          organization: organizationName,
          time: format.dateTime(new Date(expiresAt), {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })}{" "}
        <span className="text-amber-800/80 dark:text-amber-200/80">
          {t("reason", { reason })}
        </span>
      </p>
      <Button size="sm" variant="outline" disabled={isPending} onClick={end}>
        {t("end")}
      </Button>
    </aside>
  )
}
