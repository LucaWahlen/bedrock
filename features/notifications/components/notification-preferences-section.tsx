"use client"

import { ChevronRight, LockKeyhole, RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState } from "react"

import { getNotificationPreferences } from "@/features/notifications/actions/get-notification-preferences"
import { resetOrganizationNotificationPreferences } from "@/features/notifications/actions/reset-organization-notification-preferences"
import { updateNotificationPreference } from "@/features/notifications/actions/update-notification-preference"
import {
  ACCOUNT_PREFERENCE_CATEGORIES,
  NOTIFICATION_CHANNELS,
  ORGANIZATION_PREFERENCE_CATEGORIES,
} from "@/features/notifications/lib/topics"
import type {
  NotificationCategoryKey,
  NotificationChannel,
  NotificationKind,
  NotificationPreferenceOrganization,
  NotificationPreferencesOverview,
} from "@/features/notifications/types"
import { preferenceCategory } from "@/features/notifications/utils/preference-category"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { Button } from "@/features/shared/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/features/shared/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/features/shared/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/features/shared/components/ui/select"
import { Switch } from "@/features/shared/components/ui/switch"

const ALL = "all"

function OrganizationLabel({
  organization,
}: {
  organization: NotificationPreferenceOrganization
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="shrink-0" aria-hidden>
        <IdentityAvatar
          variant="sm"
          logo={organization.logo}
          name={organization.name}
          seed={organization.id}
        />
      </span>
      <span className="truncate">{organization.name}</span>
    </span>
  )
}
type Change = { organizationId: string | null } & (
  | {
      type: "toggle"
      kind: NotificationKind
      channel: NotificationChannel
      enabled: boolean
    }
  | { type: "reset" }
)

function CategoryList({
  categories,
  overview,
  organizationId,
  saving,
  onSave,
}: {
  categories: readonly {
    key: NotificationCategoryKey
    kinds: readonly NotificationKind[]
  }[]
  overview: NotificationPreferencesOverview | null
  organizationId: string | null
  saving: boolean
  onSave: (change: Change) => void
}) {
  const t = useTranslations("notifications.preferences")
  return (
    <div className="@container divide-y rounded-lg border">
      {categories.map(({ key, kinds }) => {
        const category =
          overview && preferenceCategory(kinds, overview, organizationId)
        return (
          <Collapsible key={key}>
            <CollapsibleTrigger
              disabled={!overview}
              aria-labelledby={`pref-${key}-title`}
              aria-describedby={`pref-${key}-description`}
              className="group flex w-full items-center gap-3 rounded-sm p-3 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring @min-[28rem]:px-4"
            >
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span id={`pref-${key}-title`} className="text-sm font-medium">
                  {t(`categories.${key}`)}
                </span>
                <span
                  id={`pref-${key}-description`}
                  className="text-xs text-muted-foreground"
                >
                  {t(`descriptions.${key}`)}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground group-aria-expanded:rotate-90"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {category && (
                <div className="divide-y border-t bg-muted/25 px-3 @min-[28rem]:px-4">
                  <div
                    aria-hidden
                    className="hidden grid-cols-[minmax(0,1fr)_6.5rem_7rem] gap-3 py-2 text-xs font-medium text-muted-foreground @min-[28rem]:grid"
                  >
                    <span>{t("event")}</span>
                    <span>{t("channels.inApp")}</span>
                    <span>{t("channels.email")}</span>
                  </div>
                  {category.map((item) => {
                    const name = t(`kinds.${item.kind}`)
                    return (
                      <div
                        key={item.kind}
                        className="grid grid-cols-2 items-start gap-x-3 gap-y-2 py-3 @min-[28rem]:grid-cols-[minmax(0,1fr)_6.5rem_7rem] @min-[28rem]:items-center"
                      >
                        <span className="col-span-2 wrap-anywhere @min-[28rem]:col-span-1">
                          {name}
                        </span>
                        {NOTIFICATION_CHANNELS.map((channel) => {
                          const custom =
                            channel === "email"
                              ? item.emailCustom
                              : item.inAppCustom
                          const required =
                            channel === "email" && item.emailLocked
                          const id = `pref-${item.kind}-${channel}-source`
                          return (
                            <div
                              key={channel}
                              className="flex min-w-0 flex-col items-start gap-1.5"
                            >
                              <span
                                aria-hidden
                                className="text-xs text-muted-foreground @min-[28rem]:hidden"
                              >
                                {t(`channels.${channel}`)}
                              </span>
                              {required ? (
                                <span
                                  className="inline-flex items-center gap-1.5 text-xs"
                                  title={t("channels.emailRequiredHint")}
                                >
                                  <LockKeyhole
                                    className="size-3 shrink-0 text-muted-foreground"
                                    aria-hidden
                                  />
                                  <span className="sr-only">
                                    {t("channels.email")}:{" "}
                                  </span>
                                  {t("channels.alwaysSent")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2">
                                  <Switch
                                    checked={item[channel]}
                                    disabled={saving}
                                    aria-label={t(`channels.${channel}Label`, {
                                      item: name,
                                    })}
                                    aria-describedby={custom ? id : undefined}
                                    onCheckedChange={(enabled) =>
                                      onSave({
                                        type: "toggle",
                                        organizationId,
                                        kind: item.kind,
                                        channel,
                                        enabled,
                                      })
                                    }
                                  />
                                  {custom && (
                                    <span
                                      title={t("scope.custom")}
                                      className="text-sm leading-none text-muted-foreground"
                                    >
                                      <span aria-hidden>*</span>
                                      <span id={id} className="sr-only">
                                        {t("scope.custom")}
                                      </span>
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

export function NotificationPreferencesSection() {
  const t = useTranslations("notifications.preferences")
  const tc = useTranslations("common")
  const [overview, setOverview] =
    useState<NotificationPreferencesOverview | null>(null)
  const [scope, setScope] = useState(ALL)
  const [state, setState] = useState<
    "loading" | "ready" | "saving" | "saved" | "error"
  >("loading")
  const [error, setError] = useState("")
  const [failedChange, setFailedChange] = useState<Change | null>(null)
  const [confirmation, setConfirmation] = useState<{
    change: Change
    title: string
    description: string
  } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const writing = useRef(false)
  const request = useRef<symbol | null>(null)
  const load = useCallback(
    async (afterSave = false) => {
      const token = Symbol()
      request.current = token
      const result = await getNotificationPreferences().catch(() => ({
        success: false as const,
        error: t(afterSave ? "errors.refreshFailed" : "errors.loadFailed"),
      }))
      if (token !== request.current) return
      setFailedChange(null)
      if (result.success) {
        setOverview(result.data)
        setState(afterSave ? "saved" : "ready")
        return
      }
      setOverview(null)
      setError(result.error)
      setState("error")
    },
    [t]
  )

  useEffect(() => {
    // The effect only starts an async read; state is set after it resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
    return () => {
      request.current = null
    }
  }, [load])

  async function save(change: Change, replaceOverrides = false) {
    if (writing.current || !overview) return
    writing.current = true
    const initiator = document.activeElement
    const token = request.current
    setState("saving")
    try {
      const result =
        change.type === "reset"
          ? await resetOrganizationNotificationPreferences(
              change.organizationId
            )
          : await updateNotificationPreference({
              kinds: [change.kind],
              organizationId: change.organizationId,
              enabled: change.enabled,
              channel: change.channel,
              replaceOverrides,
            })
      if (token !== request.current) return
      if (
        !result.success &&
        "needsConfirmation" in result &&
        result.needsConfirmation &&
        change.type === "toggle"
      ) {
        opener.current = initiator instanceof HTMLElement ? initiator : null
        setConfirmation({
          change,
          title: t("scope.replaceOverrides"),
          description: t("scope.confirmReplace", {
            channel: t(`channels.${change.channel}`),
            event: t(`kinds.${change.kind}`),
          }),
        })
        setConfirmOpen(true)
        setFailedChange(null)
        setState("ready")
        return
      }
      if (!result.success) {
        setError(result.error)
        setFailedChange(change)
        setState("error")
        return
      }
      // Re-read rather than duplicating the server's inheritance and reset rules.
      await load(true)
    } catch {
      if (token !== request.current) return
      setError(t("errors.saveFailed"))
      setFailedChange(change)
      setState("error")
    } finally {
      writing.current = false
    }
  }

  const organizations = overview?.organizations ?? []
  const selectedOrg = organizations.find((org) => org.id === scope)
  const organizationId = selectedOrg?.id ?? null
  const saving = state === "saving" || state === "loading"
  const canReset =
    overview &&
    (organizationId
      ? Object.keys(overview.overrides[organizationId] ?? {}).length > 0
      : overview.global.some((item) => item.emailCustom || item.inAppCustom) ||
        Object.keys(overview.overrides).length > 0)

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="space-y-1">
        <h3 ref={heading} tabIndex={-1} className="text-base font-semibold">
          {t("title")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <section className="grid min-w-0 gap-2">
        <h4 className="text-sm font-semibold">{t("groups.account")}</h4>
        <CategoryList
          categories={ACCOUNT_PREFERENCE_CATEGORIES}
          overview={overview}
          organizationId={null}
          saving={saving}
          onSave={save}
        />
      </section>
      <section className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{t("groups.organizations")}</h4>
          <Select
            items={[
              { value: ALL, label: t("scope.all") },
              ...organizations.map((org) => ({
                value: org.id,
                label: org.name,
              })),
            ]}
            value={organizationId ?? ALL}
            disabled={saving || !organizations.length}
            onValueChange={(value) => {
              if (!value) return
              setScope(value)
              setFailedChange(null)
              setState("ready")
            }}
          >
            <SelectTrigger aria-label={t("scope.label")} className="max-w-full">
              <SelectValue className="min-w-0">
                {selectedOrg ? (
                  <OrganizationLabel organization={selectedOrg} />
                ) : (
                  t("scope.all")
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectItem value={ALL}>{t("scope.all")}</SelectItem>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  <OrganizationLabel organization={org} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs wrap-anywhere text-muted-foreground">
          {selectedOrg
            ? t("scope.organizationHint", { name: selectedOrg.name })
            : t("scope.defaultHint")}
        </p>
        <CategoryList
          categories={ORGANIZATION_PREFERENCE_CATEGORIES}
          overview={overview}
          organizationId={organizationId}
          saving={saving}
          onSave={save}
        />
        {selectedOrg && canReset && (
          <p className="text-xs text-muted-foreground">
            <span aria-hidden>* </span>
            {t("scope.custom")}
          </p>
        )}
        {canReset && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            className="h-auto min-h-8 max-w-full justify-self-start whitespace-normal"
            onClick={(event) => {
              opener.current = event.currentTarget
              setConfirmation({
                change: { type: "reset", organizationId },
                title: t(
                  selectedOrg ? "scope.resetOrganization" : "scope.resetAll"
                ),
                description: selectedOrg
                  ? t("scope.confirmOrganization", { name: selectedOrg.name })
                  : t("scope.confirmAll"),
              })
              setConfirmOpen(true)
            }}
          >
            <RotateCcw aria-hidden />
            {t(selectedOrg ? "scope.resetOrganization" : "scope.resetAll")}
          </Button>
        )}
      </section>
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onOpenChangeComplete={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          initialFocus={cancel}
          finalFocus={() =>
            opener.current?.isConnected &&
            opener.current !== document.body &&
            !opener.current.matches(":disabled, [data-disabled]")
              ? opener.current
              : heading.current
          }
        >
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
            <DialogDescription>{confirmation?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button ref={cancel} variant="outline" />}>
              {tc("actions.cancel")}
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                if (!confirmation) return
                setConfirmOpen(false)
                void save(
                  confirmation.change,
                  confirmation.change.type === "toggle"
                )
              }}
            >
              {tc("actions.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <output aria-atomic="true" className="sr-only">
        {state === "saving"
          ? tc("states.saving")
          : state === "loading"
            ? t("loading")
            : state === "saved"
              ? t("saved")
              : null}
      </output>
      {state === "error" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span role="alert" className="text-destructive">
            {error}
          </span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              if (failedChange) void save(failedChange)
              else {
                setState("loading")
                void load()
              }
            }}
          >
            {tc("actions.retry")}
          </Button>
        </div>
      )}
    </div>
  )
}
