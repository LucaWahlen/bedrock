"use client"

import { ChevronDown } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useTransition } from "react"
import { toast } from "sonner"

import { setVisitorLocale } from "@/features/auth/actions/set-visitor-locale"
import { LocaleLabel } from "@/features/shared/components/locale-flag"
import { Button } from "@/features/shared/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/features/shared/components/ui/dropdown-menu"
import { isLocale, LOCALES } from "@/features/shared/lib/i18n/config"

export function LanguageSwitcher() {
  const locale = useLocale()
  const t = useTranslations("common.language")
  const [pending, startTransition] = useTransition()

  function choose(value: unknown) {
    if (!isLocale(value) || value === locale) return

    // The action revalidates, so the page comes back in the new language.
    startTransition(async () => {
      const result = await setVisitorLocale(value)
      if (!result.success) toast.error(result.error)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" aria-label={t("select")} disabled={pending}>
            <LocaleLabel locale={locale} />
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={choose}>
            {LOCALES.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                <LocaleLabel locale={option} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
