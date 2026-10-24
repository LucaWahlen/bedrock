"use client"

import { ChevronRight } from "lucide-react"

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
      <div className="flex items-center gap-2 md:hidden">
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
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
      <h1 className="truncate text-sm font-semibold">{title}</h1>
    </header>
  )
}
