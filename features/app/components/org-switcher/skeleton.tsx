"use client";

import { SidebarMenuButton } from "@/features/shared/components/ui/sidebar";
import { Skeleton } from "@/features/shared/components/ui/skeleton";

export function OrgSwitcherSkeleton() {
    return (
        <SidebarMenuButton size="lg" disabled>
            <Skeleton className="size-8 rounded-md shrink-0" />
            <Skeleton className="h-4 flex-1" />
        </SidebarMenuButton>
    );
}
