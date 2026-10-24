import { ShieldCheck } from "lucide-react"
import { useTranslations } from "next-intl"

import { Badge } from "@/features/shared/components/ui/badge"

export function TrustedBadge() {
  const t = useTranslations("applications.badges")

  return (
    <Badge
      title={t("trustedTitle")}
      className="bg-emerald-500/15 px-1 text-emerald-700 dark:text-emerald-300"
    >
      <ShieldCheck aria-hidden="true" />
      <span className="sr-only">{t("trusted")}</span>
    </Badge>
  )
}
