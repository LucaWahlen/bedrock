"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem } from "@/features/shared/components/ui/sidebar";
import { OrganizationSwitcher } from "./org-switcher";
import { organization } from "../lib/types";
import { useParams, useRouter } from "next/navigation";

interface AppSidebarProps {
    organizations: organization[];
}

export function AppSidebar({ organizations }: AppSidebarProps) {
    const params = useParams();
    const router = useRouter();
    const currentOrganization = organizations.find(org => org.slug === params?.slug);

    return (
        <Sidebar>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <OrganizationSwitcher organizations={organizations} currentOrganization={currentOrganization} onOrganizationChange={(org) => router.push(`/org/${org.slug}`)} />
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <SidebarMenu>
                    <SidebarMenuItem>
                    </SidebarMenuItem>
                </SidebarMenu>

            </SidebarContent>
            <SidebarFooter>

            </SidebarFooter>
            
        </Sidebar>
    )
}