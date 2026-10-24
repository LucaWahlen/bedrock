"use client"

import {
  KeyRound,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import { useQueryStates } from "nuqs"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { getAccount } from "@/features/account/actions/get-account"
import { DangerSection } from "@/features/account/components/account-dialog/danger-section"
import { EmailSection } from "@/features/account/components/account-dialog/email-section"
import { PasswordSection } from "@/features/account/components/account-dialog/password-section"
import { ProfileSection } from "@/features/account/components/account-dialog/profile-section"
import {
  prefetchSecurityOverview,
  SecuritySection,
} from "@/features/account/components/account-dialog/security-section"
import { SessionsSection } from "@/features/account/components/account-dialog/sessions-section"
import { accountSearchParams } from "@/features/account/lib/account-search-params"
import {
  ACCOUNT_SECTIONS,
  type AccountOverview,
  type AccountSection,
} from "@/features/account/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/features/shared/components/ui/dialog"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import { ScrollRegion } from "@/features/shared/components/ui/scroll-region"
import { Skeleton } from "@/features/shared/components/ui/skeleton"
import { cn } from "@/features/shared/lib/ui/utils"
import type { QueryResult } from "@/features/shared/types"

const SECTION_ICONS: Record<AccountSection, LucideIcon> = {
  profile: UserRound,
  password: KeyRound,
  email: Mail,
  security: ShieldCheck,
  sessions: MonitorSmartphone,
  danger: TriangleAlert,
}

// Mounted once by the user menu and driven entirely by `?account=`, so any link
// can open it on a section. Everything it shows comes from reads that check the
// session again on the server.
export function AccountDialog() {
  const t = useTranslations("account")
  const params = useParams<{ slug: string }>()
  const organizationSlug = params?.slug ?? ""
  const [{ account: section, accountNotice }, setQuery] =
    useQueryStates(accountSearchParams)
  const [overview, setOverview] = useState<AccountOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionsVersion, setSessionsVersion] = useState(0)
  const open = section !== null
  // Kept in the URL until the dialog closes, so the section can keep saying so.
  const emailJustChanged = accountNotice === "email-changed"

  function apply(result: QueryResult<AccountOverview>) {
    if (result.success) {
      setOverview(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
  }

  async function load() {
    apply(await getAccount())
  }

  // Loaded with the page and refreshed quietly on every open, so the dialog
  // opens on its content rather than on a placeholder.
  const loaded = useRef(false)
  useEffect(() => {
    if (!open && loaded.current) return
    loaded.current = true
    prefetchSecurityOverview()

    let cancelled = false
    void getAccount().then((result) => {
      if (cancelled) return
      if (result.success) {
        setOverview(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (emailJustChanged) {
      toast.success(t("dialog.emailChanged"), {
        id: "account-email-changed",
      })
    }
  }, [emailJustChanged, t])

  function close() {
    void setQuery({ account: null, accountNotice: null })
  }

  const active = section ?? "profile"

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="flex h-[min(44rem,calc(100svh-2rem))] w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl md:flex-row">
        <nav
          aria-label={t("dialog.sectionsLabel")}
          className="flex shrink-0 flex-col gap-3 border-b bg-muted/40 p-3 md:w-56 md:border-r md:border-b-0 md:p-4"
        >
          <div className="flex flex-col gap-0.5 px-1 pr-10 md:pr-1">
            <DialogTitle>{t("dialog.title")}</DialogTitle>
            <DialogDescription className="text-xs">
              {t("dialog.description")}
            </DialogDescription>
          </div>
          {/* Bleeds into the nav's padding so focus rings are not clipped and
              the horizontal scrollbar on narrow screens sits below the tabs. */}
          <ScrollRegion className="-mx-1 -mt-1 -mb-3 md:-mb-1">
            <ul className="flex w-max min-w-full gap-1 px-1 pt-1 pb-3 md:w-full md:flex-col md:pb-1">
              {ACCOUNT_SECTIONS.map((key) => {
                const Icon = SECTION_ICONS[key]
                const current = key === active

                return (
                  <li key={key} className="shrink-0">
                    <button
                      type="button"
                      aria-current={current ? "page" : undefined}
                      onClick={() => void setQuery({ account: key })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                        current &&
                          "bg-accent font-medium text-accent-foreground",
                        key === "danger" &&
                          "text-destructive hover:text-destructive"
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {t(`dialog.sections.${key}`)}
                    </button>
                  </li>
                )
              })}
            </ul>
          </ScrollRegion>
        </nav>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-4 md:p-6">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : !overview ? (
              <div className="flex flex-col gap-3" aria-busy>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-72" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <>
                {active === "profile" && (
                  <ProfileSection
                    key={[
                      overview.profile.name,
                      overview.profile.image ?? "",
                    ].join(":")}
                    profile={overview.profile}
                    onSaved={() => void load()}
                  />
                )}
                {active === "password" && (
                  <PasswordSection
                    profile={overview.profile}
                    onSessionsChanged={() => setSessionsVersion((v) => v + 1)}
                  />
                )}
                {active === "email" && (
                  <EmailSection
                    profile={overview.profile}
                    organizationSlug={organizationSlug}
                    justChanged={emailJustChanged}
                  />
                )}
                {active === "security" && (
                  <SecuritySection
                    onFactorsChanged={() => {
                      void load()
                      setSessionsVersion((v) => v + 1)
                    }}
                  />
                )}
                {active === "sessions" && (
                  <SessionsSection key={sessionsVersion} />
                )}
                {active === "danger" && (
                  <DangerSection
                    key={[
                      ...overview.soleOwnedOrganizations.map(
                        (organization) => organization.id
                      ),
                      overview.twoFactorEnabled,
                    ].join(":")}
                    organizationSlug={organizationSlug}
                    twoFactorEnabled={overview.twoFactorEnabled}
                    soleOwnedOrganizations={overview.soleOwnedOrganizations}
                  />
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
