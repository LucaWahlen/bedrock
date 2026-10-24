import type { useFormatter } from "next-intl"

import type { Translator } from "@/features/shared/lib/i18n/translator"

// How someone came to hold a role, in the words every view uses for it: the
// members table, the role's own members, and the member's roles dialog.
export function describeRoleSource(
  t: Translator<"applications">,
  format: ReturnType<typeof useFormatter>,
  {
    direct,
    groups,
  }: {
    direct: boolean
    groups: { name: string }[]
  }
): string {
  if (groups.length === 0) return t("roleSource.direct")

  const via = format.list(groups.map((granting) => granting.name))

  return direct
    ? t("roleSource.directAndVia", { groups: via })
    : t("roleSource.via", { groups: via })
}
