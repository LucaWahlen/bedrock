"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuItem } from "@/features/shared/components/ui/sidebar";
import { OrganizationSwitcher } from "./org-switcher";
import { organization } from "../types";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export function AppSidebar() {
    const params = useParams();
    const router = useRouter();
    const [organizations] = useState<organization[] | undefined>([
        { id: "bedrock", name: "Bedrock", slug: "bedrock", logoUrl: "https://cdn.lucawahlen.com/bedrock-logo.svg" },
        { id: "atlas-cluster", name: "Atlas Cluster", slug: "atlas-cluster", logoUrl: "https://avatars.githubusercontent.com/u/246841153?s=200&v=4" }
    ]);
    const currentOrganization = organizations?.find(org => org.slug === params?.slug);

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