"use client"

import { browserSupportsWebAuthn } from "@simplewebauthn/browser"
import { useFormatter, useTranslations } from "next-intl"
import { useEffect, useState, useSyncExternalStore } from "react"

import { getSecurityOverview } from "@/features/account/actions/get-security-overview"
import { AccountSectionHeading } from "@/features/account/components/account-dialog/account-form"
import { PasskeysPanel } from "@/features/account/components/account-dialog/passkeys-panel"
import { TwoFactorPanel } from "@/features/account/components/account-dialog/two-factor-panel"
import type { SecurityOverview } from "@/features/account/types"
import {
  authenticatorRemovalRefusal,
  passkeyRemovalRefusal,
} from "@/features/account/utils/second-factor-requirement"
import { Separator } from "@/features/shared/components/ui/separator"
import { Skeleton } from "@/features/shared/components/ui/skeleton"
import type { QueryResult } from "@/features/shared/types"

const subscribe = () => () => {}

function standingOf(overview: SecurityOverview) {
  return {
    twoFactorEnabled: overview.twoFactorEnabled,
    passkeyCount: overview.passkeys.length,
    requiredBy: overview.twoFactorRequiredBy,
  }
}

// The section remounts each time the dialog opens; the last overview read is
// kept so it reopens on its content, then refreshed in the background.
let cachedOverview: SecurityOverview | null = null

export function prefetchSecurityOverview() {
  void getSecurityOverview().then((result) => {
    if (result.success) cachedOverview = result.data
  })
}

export function SecuritySection({
  onFactorsChanged,
  onOverviewChange,
}: {
  // Two-factor changes replace this browser's session and change what deleting
  // the account asks for, so the dialog reloads what it knows.
  onFactorsChanged: () => void
  // Every time the factors are read, so a caller can tell when the account
  // holds one, as the page an organization requires one from does.
  onOverviewChange?: (overview: SecurityOverview) => void
}) {
  const t = useTranslations("account")
  const format = useFormatter()
  const [overview, setOverview] = useState<SecurityOverview | null>(
    () => cachedOverview
  )
  const [error, setError] = useState<string | null>(null)
  const webAuthnSupported = useSyncExternalStore(
    subscribe,
    browserSupportsWebAuthn,
    () => true
  )

  function apply(result: QueryResult<SecurityOverview>) {
    if (result.success) {
      cachedOverview = result.data
      setOverview(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
  }

  async function load() {
    apply(await getSecurityOverview())
  }

  useEffect(() => {
    let cancelled = false
    void getSecurityOverview().then((result) => {
      if (cancelled) return
      if (result.success) {
        cachedOverview = result.data
        setOverview(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (overview) onOverviewChange?.(overview)
  }, [overview, onOverviewChange])

  return (
    <div className="flex flex-col gap-4">
      <AccountSectionHeading
        title={t("security.title")}
        description={t("security.description")}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {!overview && !error && (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {overview && (
        <>
          <TwoFactorPanel
            enabled={overview.twoFactorEnabled}
            backupCodesRemaining={overview.backupCodesRemaining}
            disableRefusal={authenticatorRemovalRefusal(
              standingOf(overview),
              t,
              format
            )}
            onChanged={() => {
              void load()
              onFactorsChanged()
            }}
          />
          <Separator />
          <PasskeysPanel
            passkeys={overview.passkeys}
            supported={webAuthnSupported}
            removalRefusal={passkeyRemovalRefusal(
              standingOf(overview),
              t,
              format
            )}
            onChanged={() => void load()}
          />
        </>
      )}
    </div>
  )
}
