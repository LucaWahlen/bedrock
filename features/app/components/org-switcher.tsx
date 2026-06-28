"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/features/shared/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/features/shared/components/ui/sidebar";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { organization } from "../lib/types";
import { OrgLogo } from "./org-logo";

interface OrganizationSwitcherProps {
    organizations: organization[];
    currentOrganization?: organization;
    onOrganizationChange: (org: organization) => void;
}

export function OrganizationSwitcher({ organizations, currentOrganization, onOrganizationChange }: OrganizationSwitcherProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                    {currentOrganization ? (<>
                        <OrgLogo logoUrl={currentOrganization.logoUrl} name={currentOrganization.name} slug={currentOrganization.slug} size={32} />
                        <span className="font-semibold truncate">{currentOrganization.name}</span>
                    </>) : (
                        <span className="font-semibold truncate">Select Organization</span>
                    )}
                    <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right">
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                    {organizations?.map((org) => (
                        <DropdownMenuItem key={org.id} onClick={() => onOrganizationChange(org)} className="h-10">
                            <OrgLogo logoUrl={org.logoUrl} name={org.name} slug={org.slug} size={24} />
                            <span className="truncate">{org.name}</span>
                            {currentOrganization?.id === org.id && <Check className="ml-auto" />}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="h-10 text-sidebar-ring">
                    <Plus />
                    <span>Create Organization</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
