import { useTranslations } from "next-intl"

import { MEMBER_STATUS_DISPLAY } from "@/features/organizations/lib/member-status-display"
import type { MemberStatus } from "@/features/organizations/types"
import { Badge } from "@/features/shared/components/ui/badge"

/**
 * Whether somebody is in, and whether their address has been proven.
 * Unconfirmed accounts can sign in but cannot reach anything, and an invited
 * address is not in the organization at all, so both are worth showing next to
 * a person.
 */
export function MemberStatusBadge({
  status,
  title,
}: {
  status: MemberStatus
  title?: string
}) {
  const t = useTranslations("organizations.memberStatus")
  const { icon: Icon, variant, className } = MEMBER_STATUS_DISPLAY[status]

  return (
    <Badge variant={variant} className={className} title={title}>
      <Icon data-icon="inline-start" aria-hidden="true" />
      {t(status)}
    </Badge>
  )
}
