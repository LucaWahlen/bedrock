"use client"

import { useFormatter, useTranslations } from "next-intl"

import type {
  ApplicationRoleSummary,
  HeldApplicationRole,
} from "@/features/applications/types"
import { describeRoleSource } from "@/features/applications/utils/role-source"
import { KeyedBadges } from "@/features/shared/components/keyed-badges"

type RoleNamesProps = {
  // Held roles say how they are held; a plain summary, such as what a group
  // grants, is simply listed.
  roles: (ApplicationRoleSummary & Partial<HeldApplicationRole>)[]
}

export function RoleNames({ roles }: RoleNamesProps) {
  const t = useTranslations("applications")
  const format = useFormatter()

  return (
    <KeyedBadges
      title={t("lists.roles.title")}
      singularLabel={t("lists.roles.singular")}
      pluralLabel={t("lists.roles.plural")}
      variant="secondary"
      items={roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        inherited: role.direct === false,
        // Only worth saying when a group is involved; a direct role is the norm.
        note:
          role.groups && role.groups.length > 0
            ? describeRoleSource(t, format, {
                direct: role.direct ?? true,
                groups: role.groups,
              })
            : null,
      }))}
    />
  )
}
