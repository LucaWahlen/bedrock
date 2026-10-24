import { ShieldCheck, ShieldOff } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"

import type { SecondFactorStatus } from "@/features/organizations/types"
import { Badge } from "@/features/shared/components/ui/badge"

function useSecondFactorDescription({ totp, passkeys }: SecondFactorStatus) {
  const t = useTranslations("organizations.secondFactor")
  const format = useFormatter()
  const methods = [
    ...(totp ? [t("authenticatorApp")] : []),
    ...(passkeys > 0 ? [t("passkeys", { count: passkeys })] : []),
  ]

  return methods.length > 0
    ? format.list(methods, { type: "conjunction" })
    : t("none")
}

// Whether a member holds a second factor at all. Sky rather than emerald, which
// the address status beside it already uses.
export function SecondFactorBadge({ status }: { status: SecondFactorStatus }) {
  const t = useTranslations("organizations.secondFactor")
  const description = useSecondFactorDescription(status)
  const enabled = status.totp || status.passkeys > 0

  return enabled ? (
    <Badge
      className="bg-sky-500/15 text-sky-700 dark:text-sky-300"
      title={description}
    >
      <ShieldCheck data-icon="inline-start" aria-hidden="true" />
      {t("on")}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="text-muted-foreground"
      title={description}
    >
      <ShieldOff data-icon="inline-start" aria-hidden="true" />
      {t("off")}
    </Badge>
  )
}
