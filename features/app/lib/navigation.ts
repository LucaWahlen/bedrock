import {
  Activity,
  AppWindow,
  Blocks,
  Building2,
  ChartNoAxesCombined,
  CircleGauge,
  Contact,
  FileClock,
  KeyRound,
  LockKeyhole,
  Network,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"

import type { AppCapability } from "@/features/app/types"
import type { Messages } from "@/features/shared/lib/i18n/messages"

type NavigationMessages = Messages["app"]["navigation"]

// Keys into `app.navigation`, so the labels follow the reader's language.
export type NavigationItem = {
  key: keyof NavigationMessages["items"]
  path: string
  icon: LucideIcon
  requires: AppCapability
}

export type NavigationGroup = {
  key: keyof NavigationMessages["groups"]
  items: NavigationItem[]
}

// Only pages that exist under `app/org/[slug]/(app)` belong here.
const rootNavigation: NavigationGroup[] = [
  {
    key: "platform",
    items: [
      { key: "overview", path: "", icon: CircleGauge, requires: "overview" },
      {
        key: "organizations",
        path: "/organizations",
        icon: Building2,
        requires: "administerInstance",
      },
      {
        key: "members",
        path: "/members",
        icon: Users,
        requires: "manageOrganization",
      },
      {
        key: "directory",
        path: "/directory",
        icon: Contact,
        requires: "administerInstance",
      },
      {
        key: "applications",
        path: "/applications",
        icon: Blocks,
        requires: "manageOrganization",
      },
    ],
  },
  {
    key: "governance",
    items: [
      {
        key: "auditLog",
        path: "/audit-log",
        icon: FileClock,
        requires: "viewAuditLog",
      },
    ],
  },
  {
    key: "system",
    items: [
      {
        key: "health",
        path: "/health",
        icon: Activity,
        requires: "administerInstance",
      },
      {
        key: "usage",
        path: "/usage",
        icon: ChartNoAxesCombined,
        requires: "administerInstance",
      },
    ],
  },
]

const organizationNavigation: NavigationGroup[] = [
  {
    key: "workspace",
    items: [
      { key: "overview", path: "", icon: CircleGauge, requires: "overview" },
      {
        key: "members",
        path: "/members",
        icon: Users,
        requires: "manageOrganization",
      },
      {
        key: "applications",
        path: "/applications",
        icon: AppWindow,
        requires: "manageOrganization",
      },
      {
        key: "groups",
        path: "/groups",
        icon: Network,
        requires: "manageOrganization",
      },
    ],
  },
  {
    key: "access",
    items: [
      {
        key: "roles",
        path: "/roles",
        icon: KeyRound,
        requires: "manageOrganization",
      },
      {
        key: "authentication",
        path: "/authentication",
        icon: LockKeyhole,
        requires: "manageAuthentication",
      },
    ],
  },
  {
    key: "organization",
    items: [
      {
        key: "usage",
        path: "/usage",
        icon: ChartNoAxesCombined,
        requires: "manageOrganization",
      },
      {
        key: "auditLog",
        path: "/audit-log",
        icon: FileClock,
        requires: "viewAuditLog",
      },
      {
        key: "settings",
        path: "/settings",
        icon: Settings,
        requires: "manageOrganization",
      },
    ],
  },
]

// Groups left without a reachable item are dropped rather than shown empty.
export function navigationFor(
  isRoot: boolean,
  capabilities: readonly AppCapability[]
): NavigationGroup[] {
  const granted = new Set(capabilities)

  return (isRoot ? rootNavigation : organizationNavigation).flatMap((group) => {
    const items = group.items.filter((item) => granted.has(item.requires))

    return items.length > 0 ? [{ ...group, items }] : []
  })
}
