"use client"

import { RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { Button } from "@/features/shared/components/ui/button"
import { cn } from "@/features/shared/lib/ui/utils"

// Renders the page again on the server, which runs every check afresh. The
// current results stay on screen until the new ones arrive.
export function RerunChecksButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations("health")

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw
        className={cn(isPending && "animate-spin")}
        aria-hidden="true"
      />
      {t("rerun")}
    </Button>
  )
}
