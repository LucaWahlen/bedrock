import { useTranslations } from "next-intl"

import {
  isOrganizationRole,
  MEMBER_ROLE_DISPLAY,
  sortRoles,
} from "@/features/organizations/lib/member-role-display"
import { Badge } from "@/features/shared/components/ui/badge"

type RoleBadgesProps = {
  roles: string[]
}

export function RoleBadges({ roles }: RoleBadgesProps) {
  const t = useTranslations("organizations")

  if (roles.length === 0) {
    return <span className="text-muted-foreground">{t("none")}</span>
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {sortRoles(roles).map((role) => {
        if (!isOrganizationRole(role)) {
          return (
            <Badge key={role} variant="outline">
              {role}
            </Badge>
          )
        }

        const display = MEMBER_ROLE_DISPLAY[role]
        const RoleIcon = display.icon

        return (
          <Badge key={role} className={display.className}>
            <RoleIcon data-icon="inline-start" aria-hidden="true" />
            {t(`roles.${role}.label`)}
          </Badge>
        )
      })}
    </div>
  )
}
