"use client"

import { LogOut, Monitor, Smartphone, Tablet } from "lucide-react"
import { useFormatter, useNow, useTranslations } from "next-intl"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { getAccountSessions } from "@/features/account/actions/get-account-sessions"
import { revokeOtherSessions } from "@/features/account/actions/revoke-other-sessions"
import { revokeSession } from "@/features/account/actions/revoke-session"
import { AccountSectionHeading } from "@/features/account/components/account-dialog/account-form"
import type { AccountSession, DeviceType } from "@/features/account/types"
import { deviceLabel } from "@/features/account/utils/user-agent"
import { Badge } from "@/features/shared/components/ui/badge"
import { Button } from "@/features/shared/components/ui/button"
import { Skeleton } from "@/features/shared/components/ui/skeleton"
import type { QueryResult } from "@/features/shared/types"

const DEVICE_ICONS: Record<DeviceType, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: Monitor,
}

const DAY = 24 * 60 * 60 * 1000

// Activity is only tracked daily, so anything finer would claim more than the
// value knows.
function useActivity() {
  const t = useTranslations("account")
  const format = useFormatter()
  const now = useNow()

  return (value: string) => {
    const date = new Date(value)
    const days = Math.floor((now.getTime() - date.getTime()) / DAY)

    if (days <= 0) return t("sessions.activity.today")
    if (days === 1) return t("sessions.activity.yesterday")
    if (days < 30) return format.relativeTime(date, { now, unit: "day" })

    return format.dateTime(date, "date")
  }
}

export function SessionsSection() {
  const t = useTranslations("account")
  const format = useFormatter()
  const activity = useActivity()
  const [sessions, setSessions] = useState<AccountSession[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function apply(result: QueryResult<AccountSession[]>) {
    if (result.success) {
      setSessions(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
  }

  async function load() {
    apply(await getAccountSessions())
  }

  // Loaded when the section is shown; the dialog remounts it to reload.
  useEffect(() => {
    let cancelled = false
    void getAccountSessions().then((result) => {
      if (cancelled) return
      if (result.success) {
        setSessions(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeSession(id)
      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(t("sessions.signedOut"))
      await load()
    })
  }

  function revokeOthers() {
    startTransition(async () => {
      const result = await revokeOtherSessions()
      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(t("sessions.othersSignedOut"))
      await load()
    })
  }

  const others = sessions?.filter((session) => !session.current) ?? []

  return (
    <div className="flex flex-col gap-4">
      <AccountSectionHeading
        title={t("sessions.title")}
        description={t("sessions.description")}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {!sessions && !error && (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {sessions && (
        <ul className="divide-y rounded-lg border" aria-busy={isPending}>
          {sessions.map((session) => {
            const Icon = DEVICE_ICONS[session.device.type]

            return (
              <li
                key={session.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Icon
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {deviceLabel(session.device, t)}
                      </span>
                      {session.current && (
                        <Badge variant="secondary">
                          {t("sessions.thisDevice")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("sessions.details", {
                        address:
                          session.ipAddress ?? t("sessions.unknownAddress"),
                        signedIn: format.dateTime(
                          new Date(session.createdAt),
                          "dateTime"
                        ),
                        lastActive: activity(session.lastActiveAt),
                      })}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start sm:self-auto"
                    disabled={isPending}
                    onClick={() => revoke(session.id)}
                  >
                    {t("sessions.signOut")}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {others.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={revokeOthers}
          >
            <LogOut />
            {t("sessions.signOutOthers")}
          </Button>
        </div>
      )}
    </div>
  )
}
