"use client"

import { ShieldAlert, ShieldCheck, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useQueryStates } from "nuqs"
import { useEffect, useRef, useState } from "react"

import { useAccountDialog } from "@/features/account/components/account-dialog/use-account-dialog"
import { accountSearchParams } from "@/features/account/lib/account-search-params"
import { Button } from "@/features/shared/components/ui/button"

/**
 * A prompt to add a second factor, for an account with neither an
 * authenticator app nor a passkey. Whether to show it is the server's call, so
 * it is part of the first render; dismissing it lasts until the page is loaded
 * again.
 */
export function AccountSecurityNudge() {
  const t = useTranslations("account")
  const [dismissed, setDismissed] = useState(false)
  const dialog = useAccountDialog()
  const router = useRouter()
  const [{ account }] = useQueryStates(accountSearchParams)
  const wasOpen = useRef(account !== null)

  // Once the dialog closes, the server decides again whether a factor is
  // still missing, so a freshly added one takes the prompt away.
  useEffect(() => {
    if (wasOpen.current && account === null) router.refresh()
    wasOpen.current = account !== null
  }, [account, router])

  if (dismissed) return null

  return (
    <section
      aria-labelledby="account-security-nudge-heading"
      className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 text-card-foreground sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ShieldAlert
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id="account-security-nudge-heading"
            className="text-sm font-medium"
          >
            {t("nudge.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("nudge.description")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
        <Button type="button" size="sm" onClick={() => dialog.open("security")}>
          <ShieldCheck />
          {t("nudge.action")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("nudge.dismiss")}
          onClick={() => setDismissed(true)}
        >
          <X />
        </Button>
      </div>
    </section>
  )
}
