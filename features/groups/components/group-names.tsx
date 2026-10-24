"use client"

import { useTranslations } from "next-intl"

import type { GroupSummary } from "@/features/groups/types"
import { KeyedBadges } from "@/features/shared/components/keyed-badges"

export function GroupNames({ groups }: { groups: GroupSummary[] }) {
  const t = useTranslations("groups.lists.groups")

  return (
    <KeyedBadges
      title={t("title")}
      singularLabel={t("singular")}
      pluralLabel={t("plural")}
      variant="outline"
      items={groups}
    />
  )
}
