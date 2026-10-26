import { ShieldCheck } from "lucide-react"
import { useTranslations } from "next-intl"

import { Badge } from "@/features/shared/components/ui/badge"

export function TrustedBadge() {
  const t = useTranslations("applications.badges")

  return (
    <Badge variant="success" title={t("trustedTitle")} className="px-1">
      <ShieldCheck aria-hidden="true" />
      <span className="sr-only">{t("trusted")}</span>
    </Badge>
  )
}
