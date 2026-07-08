"use client"

import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useParams } from "next/navigation"
import { use } from "react"

import { OrgLogo } from "@/features/app/components/org-logo"
import { user } from "@/features/app/lib/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/features/shared/components/ui/sidebar"

interface UserMenuContentProps {
  userPromise: Promise<user>
}

export function UserMenuContent({ userPromise }: UserMenuContentProps) {
  const currentUser = use(userPromise)
  const params = useParams()
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton size="lg">
            <OrgLogo
              logo={currentUser.image}
              name={currentUser.name}
              id={currentUser.email}
              variant="md"
            />
            <div className="flex flex-col truncate text-left">
              <span className="truncate font-semibold">{currentUser.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">
                {currentUser.email}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent align="start" side="right">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1.5 py-1.5">
              <OrgLogo
                logo={currentUser.image}
                name={currentUser.name}
                id={currentUser.email}
                variant="sm"
              />
              <div className="flex flex-col truncate text-left">
                <span className="truncate font-semibold">
                  {currentUser.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentUser.email}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="system">
              <Monitor />
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon />
              Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              window.location.href = `/org/${params?.slug}/logout`
            }}
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
