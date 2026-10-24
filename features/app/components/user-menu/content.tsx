"use client"

import {
  ChevronsUpDown,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserRoundCog,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useParams } from "next/navigation"
import { use, useTransition } from "react"
import { toast } from "sonner"

import { AccountDialog, setLocale, useAccountDialog } from "@/features/account"
import type { AccessUser } from "@/features/auth"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { LocaleLabel } from "@/features/shared/components/locale-flag"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import {
  SidebarMenuButton,
  useSidebar,
} from "@/features/shared/components/ui/sidebar"
import { isLocale, LOCALES } from "@/features/shared/lib/i18n/config"

const THEMES = [
  { value: "system", icon: Monitor },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
] as const

type Theme = (typeof THEMES)[number]["value"]

function themeOf(value: string | undefined) {
  return THEMES.find((theme) => theme.value === value) ?? THEMES[0]
}

interface UserMenuContentProps {
  userPromise: Promise<AccessUser>
}

export function UserMenuContent({ userPromise }: UserMenuContentProps) {
  const currentUser = use(userPromise)
  const params = useParams()
  const accountDialog = useAccountDialog()
  const { theme, setTheme } = useTheme()
  const { isMobile } = useSidebar()
  const t = useTranslations("app.userMenu")
  const tLanguage = useTranslations("common.language")
  const locale = useLocale()
  const [changingLocale, startLocaleChange] = useTransition()
  const currentTheme = themeOf(theme)

  function chooseLocale(value: unknown) {
    if (!isLocale(value) || value === locale) return

    // Saved on the account; the action revalidates, so every page re-renders
    // in the new language.
    startLocaleChange(async () => {
      const result = await setLocale(value)
      if (!result.success) toast.error(result.error)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton size="lg">
              <IdentityAvatar
                logo={currentUser.image}
                name={currentUser.name}
                seed={currentUser.id}
                variant="md"
              />
              <div className="flex flex-col truncate text-left">
                <span className="truncate font-semibold">
                  {currentUser.name}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/70">
                  {currentUser.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          }
        />
        <DropdownMenuContent align="start" side={isMobile ? "bottom" : "right"}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1.5 py-1.5">
                <IdentityAvatar
                  logo={currentUser.image}
                  name={currentUser.name}
                  seed={currentUser.id}
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
            <DropdownMenuItem onClick={() => accountDialog.open()}>
              <UserRoundCog />
              {t("settings")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {/* One row each, however many choices they hold, so the menu does
              not grow with every language or theme. */}
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <currentTheme.icon />
                {t("theme")}
                <span className="ml-auto pl-4 text-muted-foreground">
                  {t(`themes.${currentTheme.value}`)}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40">
                <DropdownMenuRadioGroup
                  value={currentTheme.value}
                  onValueChange={(value: Theme) => setTheme(value)}
                >
                  {THEMES.map((option) => (
                    <DropdownMenuRadioItem
                      key={option.value}
                      value={option.value}
                    >
                      <option.icon />
                      {t(`themes.${option.value}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages />
                {tLanguage("label")}
                <span className="ml-auto flex items-center gap-1.5 pl-4 text-muted-foreground">
                  <LocaleLabel locale={locale} />
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40">
                <DropdownMenuRadioGroup
                  value={locale}
                  onValueChange={chooseLocale}
                >
                  {LOCALES.map((option) => (
                    <DropdownMenuRadioItem
                      key={option}
                      value={option}
                      disabled={changingLocale}
                    >
                      <LocaleLabel locale={option} />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
              {t("logOut")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AccountDialog />
    </>
  )
}
