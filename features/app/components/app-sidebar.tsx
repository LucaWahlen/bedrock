"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { OrgSwitcher } from "@/features/app/components/org-switcher"
import { UserMenu } from "@/features/app/components/user-menu"
import { navigationFor } from "@/features/app/lib/navigation"
import type { AppCapability } from "@/features/app/types"
import type { AccessUser } from "@/features/auth"
import {
  CreateOrganizationDialog,
  type Organization,
} from "@/features/organizations"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/features/shared/components/ui/sidebar"

type AppSidebarProps = {
  canCreateOrganization: boolean
  capabilities: AppCapability[]
  currentOrganization: Organization
  organizationsPromise: Promise<Organization[]>
  userPromise: Promise<AccessUser>
}

export function AppSidebar({
  canCreateOrganization,
  capabilities,
  currentOrganization,
  organizationsPromise,
  userPromise,
}: AppSidebarProps) {
  const [createOrganizationOpen, setCreateOrganizationOpen] = useState(false)
  const pathname = usePathname()
  const t = useTranslations("app.navigation")
  const basePath = `/org/${currentOrganization.slug}`
  // Hiding a link is not authorization — every page below guards itself. The
  // capabilities come from the server; nothing here reads a role.
  const navigation = navigationFor(currentOrganization.isRoot, capabilities)

  return (
    <>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <OrgSwitcher
                canCreateOrganization={canCreateOrganization}
                organizationsPromise={organizationsPromise}
                onCreateOrganization={() => setCreateOrganizationOpen(true)}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {navigation.map((group) => (
            <SidebarGroup key={group.key}>
              <SidebarGroupLabel>{t(`groups.${group.key}`)}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => {
                  const href = `${basePath}${item.path}`
                  const title = t(`items.${item.key}`)
                  const isActive =
                    item.path === ""
                      ? pathname === href
                      : pathname === href || pathname.startsWith(`${href}/`)

                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        render={<Link href={href} />}
                        isActive={isActive}
                        tooltip={title}
                      >
                        <item.icon />
                        <span>{title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <UserMenu userPromise={userPromise} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {canCreateOrganization && (
        <CreateOrganizationDialog
          open={createOrganizationOpen}
          onOpenChange={setCreateOrganizationOpen}
        />
      )}
    </>
  )
}
