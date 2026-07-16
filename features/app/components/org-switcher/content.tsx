"use client"

import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { use } from "react"

import { IdentityAvatar } from "@/features/app/components/identity-avatar"
import { organization } from "@/features/app/lib/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/features/shared/components/ui/sidebar"

interface OrgSwitcherContentProps {
  organizationsPromise: Promise<organization[]>
}

export function OrgSwitcherContent({
  organizationsPromise,
}: OrgSwitcherContentProps) {
  const organizations = use(organizationsPromise)
  const params = useParams()
  const router = useRouter()
  const currentOrganization = organizations.find(
    (org) => org.slug === params?.slug
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton size="lg">
            {currentOrganization ? (
              <>
                <IdentityAvatar
                  logo={currentOrganization.logo}
                  name={currentOrganization.name}
                  id={currentOrganization.id}
                  variant="md"
                />
                <span className="truncate font-semibold">
                  {currentOrganization.name}
                </span>
              </>
            ) : (
              <span className="truncate font-semibold">
                Select Organization
              </span>
            )}
            <ChevronsUpDown className="ml-auto" />
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent align="start" side="right">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {organizations?.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => router.push(`/org/${org.slug}`)}
              className="h-10"
            >
              <IdentityAvatar
                logo={org.logo}
                name={org.name}
                id={org.id}
                variant="sm"
              />
              <span className="truncate">{org.name}</span>
              {currentOrganization?.id === org.id && (
                <Check className="ml-auto" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-10 text-sidebar-ring">
          <div className="flex size-6 items-center justify-center rounded-md bg-sidebar-accent">
            <Plus className="text-primary" />
          </div>
          <span>Create Organization</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
