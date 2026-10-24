"use client"

import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useParams, useRouter } from "next/navigation"
import { use } from "react"

import type { Organization } from "@/features/organizations"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import {
  SidebarMenuButton,
  useSidebar,
} from "@/features/shared/components/ui/sidebar"

interface OrgSwitcherContentProps {
  canCreateOrganization: boolean
  organizationsPromise: Promise<Organization[]>
  onCreateOrganization: () => void
}

export function OrgSwitcherContent({
  canCreateOrganization,
  organizationsPromise,
  onCreateOrganization,
}: OrgSwitcherContentProps) {
  const organizations = use(organizationsPromise)
  const params = useParams()
  const router = useRouter()
  const { isMobile } = useSidebar()
  const t = useTranslations("app.orgSwitcher")
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
                  seed={currentOrganization.id}
                  variant="md"
                />
                <span className="truncate font-semibold">
                  {currentOrganization.name}
                </span>
              </>
            ) : (
              <span className="truncate font-semibold">{t("select")}</span>
            )}
            <ChevronsUpDown className="ml-auto" />
          </SidebarMenuButton>
        }
      />
      {/* Only the organization list scrolls, so the popup never shows a native
          scrollbar and the create action stays in reach. */}
      <DropdownMenuContent
        align="start"
        side={isMobile ? "bottom" : "right"}
        className="flex flex-col overflow-y-hidden"
      >
        <DropdownMenuGroup className="flex min-h-0 flex-col">
          <DropdownMenuLabel>{t("organizations")}</DropdownMenuLabel>
          <ScrollArea className="group/organizations flex min-h-0 flex-col *:data-[slot=scroll-area-viewport]:max-h-80 *:data-[slot=scroll-area-viewport]:min-h-0">
            <div className="group-data-has-overflow-y/organizations:pr-2.5">
              {organizations?.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => router.push(`/org/${org.slug}`)}
                  className="h-10"
                >
                  <IdentityAvatar
                    logo={org.logo}
                    name={org.name}
                    seed={org.id}
                    variant="sm"
                  />
                  <span className="truncate">{org.name}</span>
                  {currentOrganization?.id === org.id && (
                    <Check className="ml-auto" />
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          </ScrollArea>
        </DropdownMenuGroup>
        {canCreateOrganization && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="h-10 text-sidebar-ring"
              onClick={onCreateOrganization}
            >
              <Plus />
              <span>{t("create")}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
