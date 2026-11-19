import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { NotificationBell } from "@/features/notifications"
import type { Organization } from "@/features/organizations"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { Separator } from "@/features/shared/components/ui/separator"
import { SidebarTrigger } from "@/features/shared/components/ui/sidebar"

type AppHeaderProps = {
  title: string
  organization: Organization
}

export function AppHeader({ title, organization }: AppHeaderProps) {
  return (
    <header className="flex min-h-14 items-center gap-3 border-b bg-background px-4">
      <SidebarTrigger className="md:hidden" />
      <Separator orientation="vertical" className="my-auto h-4 md:hidden" />
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <Link
          href={`/org/${organization.slug}`}
          className="flex min-w-0 items-center gap-2 rounded-sm transition-colors outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <IdentityAvatar
            logo={organization.logo}
            name={organization.name}
            seed={organization.id}
            variant="sm"
            eager
          />
          <span className="max-w-28 truncate text-sm font-medium sm:max-w-40">
            {organization.name}
          </span>
        </Link>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <h1 className="truncate text-sm font-semibold">{title}</h1>
      <NotificationBell />
    </header>
  )
}
