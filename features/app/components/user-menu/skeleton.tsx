"use client"

import { SidebarMenuButton } from "@/features/shared/components/ui/sidebar"
import { Skeleton } from "@/features/shared/components/ui/skeleton"

export function UserMenuSkeleton() {
  return (
    <SidebarMenuButton size="lg" disabled>
      <Skeleton className="size-8 shrink-0 rounded-md" />
      <Skeleton className="h-4 flex-1" />
    </SidebarMenuButton>
  )
}
