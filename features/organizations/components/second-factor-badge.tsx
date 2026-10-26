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

// Whether a member holds a second factor at all, in the same tones as the
// address status beside it: green when it is in place, grey when it is not.
export function SecondFactorBadge({ status }: { status: SecondFactorStatus }) {
  const t = useTranslations("organizations.secondFactor")
  const description = useSecondFactorDescription(status)
  const enabled = status.totp || status.passkeys > 0

  return enabled ? (
    <Badge variant="success" title={description}>
      <ShieldCheck data-icon="inline-start" aria-hidden="true" />
      {t("on")}
    </Badge>
  ) : (
    <Badge variant="muted" title={description}>
      <ShieldOff data-icon="inline-start" aria-hidden="true" />
      {t("off")}
    </Badge>
  )
}
