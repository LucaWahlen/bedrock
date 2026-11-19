"use client"

import {
  AtSign,
  Bell,
  CheckCheck,
  Fingerprint,
  KeyRound,
  ListRestart,
  LogIn,
  MailCheck,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Undo2,
  UserRoundCheck,
  Users,
} from "lucide-react"
import { useFormatter, useNow, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { useAccountDialog } from "@/features/account"
import { listNotifications } from "@/features/notifications/actions/list-notifications"
import { markAllNotificationsRead } from "@/features/notifications/actions/mark-all-notifications-read"
import { markNotificationRead } from "@/features/notifications/actions/mark-notification-read"
import type {
  AccountNotificationKind,
  NotificationCursor,
  NotificationFeed,
  NotificationFeedQuery,
  NotificationItem,
} from "@/features/notifications/types"
import { formatInboxItem } from "@/features/notifications/utils/format-inbox-item"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { Badge } from "@/features/shared/components/ui/badge"
import { Button } from "@/features/shared/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/features/shared/components/ui/popover"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/features/shared/components/ui/tabs"
import { cn } from "@/features/shared/lib/ui/utils"
import type { ActionResult } from "@/features/shared/types"

type Filter = NonNullable<NotificationFeedQuery["filter"]>

const accountIcons = {
  password_changed: KeyRound,
  email_change_requested: AtSign,
  email_changed: MailCheck,
  two_factor_enabled: ShieldCheck,
  two_factor_disabled: ShieldOff,
  backup_codes_regenerated: ListRestart,
  passkey_added: Fingerprint,
  passkey_removed: Fingerprint,
  account_enabled: UserRoundCheck,
  new_sign_in: LogIn,
} satisfies Record<AccountNotificationKind, typeof Bell>

export function NotificationBell() {
  const t = useTranslations("notifications")
  const tc = useTranslations("common")
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const router = useRouter()
  const accountDialog = useAccountDialog()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>("unread")
  const [feed, setFeed] = useState<NotificationFeed | null>(null)
  const [loading, setLoading] = useState<"first" | "more" | null>("first")
  const [failure, setFailure] = useState<{
    message?: string
    cursor?: NotificationCursor
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState("")
  const [announcement, setAnnouncement] = useState("")
  const request = useRef(0)
  const activeFilter = useRef<Filter>("unread")
  const pages = useRef<Partial<Record<Filter, NotificationFeed>>>({})
  const panel = useRef<HTMLDivElement>(null)
  const unreadTab = useRef<HTMLButtonElement>(null)
  const [pendingHeight, setPendingHeight] = useState(0)
  const writing = useRef(false)
  const isOpen = useRef(false)
  const openVersion = useRef(0)
  const invalidate = useCallback(() => {
    ++request.current
    ++openVersion.current
  }, [])
  const load = useCallback(
    async (mode: Filter, cursor?: NotificationCursor) => {
      const ticket = ++request.current
      setLoading(cursor ? "more" : "first")
      setFailure(null)
      try {
        const result = await listNotifications({
          filter: mode,
          cursor,
        })
        if (ticket !== request.current) return
        if (!result.success) {
          setFeed(null)
          setFailure({ message: result.error })
        } else {
          const previous = cursor && pages.current[mode]
          const page = { ...result.data }
          if (previous)
            page.notifications = [
              ...previous.notifications,
              ...page.notifications,
            ]
          pages.current[mode] = page
          if (mode === "all" && !page.nextCursor) {
            pages.current.unread = {
              ...page,
              notifications: page.notifications.filter((item) => !item.readAt),
            }
          }
          setFeed(page)
        }
      } catch {
        if (ticket !== request.current) return
        if (!cursor) setFeed(null)
        setFailure({ cursor })
      } finally {
        if (ticket === request.current) {
          setLoading(null)
          setPendingHeight(0)
        }
      }
    },
    []
  )

  useEffect(() => {
    const refresh = () => {
      if (!writing.current && !isOpen.current) {
        pages.current = {}
        void load(activeFilter.current)
      }
    }
    refresh()
    window.addEventListener("focus", refresh)
    return () => {
      invalidate()
      window.removeEventListener("focus", refresh)
    }
  }, [invalidate, load])

  function selectFilter(mode: unknown) {
    if (
      (mode !== "all" && mode !== "unread") ||
      mode === activeFilter.current ||
      writing.current
    )
      return
    activeFilter.current = mode
    ++request.current
    setFilter(mode)
    setActionError("")
    setFailure(null)
    const cached = pages.current[mode]
    if (cached) {
      setFeed(cached)
      setPendingHeight(0)
      setLoading(null)
    } else {
      setPendingHeight(panel.current?.offsetHeight ?? 0)
      void load(mode)
    }
  }

  function changeOpen(next: boolean) {
    isOpen.current = next
    setOpen(next)
    ++openVersion.current
    if (next && !writing.current) {
      activeFilter.current = "unread"
      setFilter("unread")
      pages.current = {}
      setActionError("")
      setAnnouncement("")
      void load("unread")
    }
  }

  function changeReadStatus(item: NotificationItem) {
    if (!feed || writing.current || loading) return false
    const read = item.readAt === null
    if (filter === "unread" && read) {
      const row = document.activeElement?.closest("li")
      if (row && panel.current?.contains(row) && row.dataset.item === item.id) {
        const neighbor = row.nextElementSibling ?? row.previousElementSibling
        const target =
          neighbor?.querySelector<HTMLButtonElement>("[data-mark-read]")
        ;(target ?? unreadTab.current)?.focus()
      }
    }
    const readAt = read ? now.toISOString() : null
    const next = {
      ...feed,
      unreadCount: Math.max(0, feed.unreadCount + (read ? -1 : 1)),
      notifications:
        filter === "unread" && read
          ? feed.notifications.filter((row) => row.id !== item.id)
          : feed.notifications.map((row) =>
              row.id === item.id ? { ...row, readAt } : row
            ),
    }
    return saveReadStatus(next, () =>
      markNotificationRead({ id: item.id, read })
    )
  }

  function markAllRead() {
    if (!feed?.unreadCount) return
    const readAt = now.toISOString()
    const next =
      filter === "unread"
        ? { unreadCount: 0, notifications: [], nextCursor: null }
        : {
            ...feed,
            unreadCount: 0,
            notifications: feed.notifications.map((row) =>
              row.readAt ? row : { ...row, readAt }
            ),
          }
    return saveReadStatus(next, markAllNotificationsRead)
  }

  async function saveReadStatus(
    next: NotificationFeed,
    action: () => Promise<ActionResult>
  ) {
    if (writing.current || loading || !feed) return false
    writing.current = true
    const ticket = ++request.current
    setFeed(next)
    setSaving(true)
    setActionError("")
    setAnnouncement("")
    try {
      const result = await action()
      if (ticket !== request.current) return false
      if (!result.success) {
        setFeed(feed)
        setActionError(result.error)
        return false
      }
      setAnnouncement(t("inbox.updated"))
      pages.current = { [filter]: next }
      return true
    } catch {
      if (ticket === request.current) {
        setFeed(feed)
        setActionError(tc("errors.unexpected"))
      }
      return false
    } finally {
      writing.current = false
      setSaving(false)
    }
  }

  async function activate(item: NotificationItem) {
    const version = openVersion.current
    if (item.readAt === null && !(await changeReadStatus(item))) return
    if (!item.link || version !== openVersion.current) return
    changeOpen(false)
    if (item.link.type === "account") accountDialog.open(item.link.section)
    else router.push(`/org/${item.link.slug}${item.link.path ?? ""}`)
  }

  const count = feed?.unreadCount ?? 0
  const busy = saving || loading !== null
  const showRows = feed && loading !== "first"

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative ml-auto"
            aria-label={
              count
                ? t("inbox.buttonLabelUnread", { count })
                : t("inbox.buttonLabel")
            }
          >
            <Bell aria-hidden />
            {count > 0 && (
              <Badge
                aria-hidden
                className="absolute -top-1 -right-1 h-4 min-w-4 px-1"
              >
                {count > 9 ? "9+" : format.number(count)}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-(--available-height) w-[min(27rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <Tabs
          value={filter}
          onValueChange={selectFilter}
          className="min-h-0 gap-0"
        >
          <div className="space-y-3 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <PopoverTitle>{t("inbox.title")}</PopoverTitle>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("inbox.actions.openSettings")}
                title={t("inbox.actions.openSettings")}
                onClick={() => {
                  changeOpen(false)
                  accountDialog.open("notifications")
                }}
              >
                <Settings2 aria-hidden />
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList activateOnFocus aria-label={t("inbox.filters.label")}>
                {(["unread", "all"] as const).map((mode) => (
                  <TabsTrigger
                    key={mode}
                    value={mode}
                    ref={mode === "unread" ? unreadTab : undefined}
                    aria-disabled={saving}
                  >
                    {t(`inbox.filters.${mode}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || count === 0}
                onClick={() => void markAllRead()}
              >
                {t("inbox.actions.markAllRead")}
              </Button>
            </div>
          </div>
          {actionError && (
            <p
              role="alert"
              className="border-b px-4 py-2 text-sm text-destructive"
            >
              {actionError}
            </p>
          )}
          <output className="sr-only">
            {saving ? t("inbox.saving") : announcement}
          </output>
          <TabsContent
            ref={panel}
            value={filter}
            className="min-h-0 overflow-hidden"
            style={pendingHeight ? { minHeight: pendingHeight } : undefined}
          >
            <ScrollArea className="*:data-[slot=scroll-area-viewport]:max-h-[min(23rem,54dvh)] *:data-[slot=scroll-area-viewport]:overscroll-y-none">
              <div aria-busy={busy}>
                {showRows && feed.notifications.length > 0 && (
                  <ul className="divide-y">
                    {feed.notifications.map((item) => {
                      const unread = item.readAt === null
                      const { title, body } = formatInboxItem(
                        item,
                        t,
                        (values) => format.list(values, { type: "conjunction" })
                      )
                      const date = new Date(item.createdAt)
                      const Icon = Object.hasOwn(accountIcons, item.kind)
                        ? accountIcons[item.kind as AccountNotificationKind]
                        : Users
                      const content = (
                        <>
                          <span
                            aria-hidden
                            className="grid size-8 shrink-0 place-items-center"
                          >
                            {item.organization ? (
                              <IdentityAvatar
                                variant="sm"
                                logo={item.organization.logo}
                                name={item.organization.name}
                                seed={item.organization.id}
                              />
                            ) : (
                              <Icon className="size-5 text-muted-foreground" />
                            )}
                          </span>
                          <span className="min-w-0 space-y-1">
                            <span
                              className={cn(
                                "block",
                                unread ? "font-semibold" : "font-medium"
                              )}
                            >
                              {title}
                            </span>
                            {body && (
                              <span className="block text-muted-foreground">
                                {body}
                              </span>
                            )}
                            <span className="block text-xs text-muted-foreground">
                              <time
                                dateTime={item.createdAt}
                                title={format.dateTime(date, "dateTime")}
                              >
                                {format.relativeTime(
                                  date,
                                  date > now ? date : now
                                )}
                              </time>
                              {filter === "all" && (
                                <span className="sr-only">
                                  {" "}
                                  {t(unread ? "inbox.unread" : "inbox.read")}
                                </span>
                              )}
                            </span>
                          </span>
                        </>
                      )
                      const rowLayout =
                        "flex items-start justify-start gap-3 py-2.5 pr-12 pl-2.5 wrap-anywhere"
                      return (
                        <li
                          key={item.id}
                          data-item={item.id}
                          className="relative px-1.5 py-1"
                        >
                          {item.link || unread ? (
                            <Button
                              variant="ghost"
                              type="button"
                              disabled={!!loading}
                              aria-disabled={busy}
                              onClick={() =>
                                !writing.current && void activate(item)
                              }
                              className={cn(
                                rowLayout,
                                "h-auto w-full text-left font-normal whitespace-normal"
                              )}
                            >
                              {content}
                            </Button>
                          ) : (
                            <div className={rowLayout}>{content}</div>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            data-mark-read=""
                            className="absolute top-2 right-3"
                            disabled={!!loading}
                            aria-disabled={busy}
                            title={t(
                              unread
                                ? "inbox.actions.markRead"
                                : "inbox.actions.markUnread"
                            )}
                            aria-label={t(
                              unread
                                ? "inbox.markItemRead"
                                : "inbox.markItemUnread",
                              { title }
                            )}
                            onClick={() => void changeReadStatus(item)}
                          >
                            {unread ? (
                              <CheckCheck aria-hidden />
                            ) : (
                              <Undo2 aria-hidden />
                            )}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              {loading && (
                <output className="block px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("inbox.loading")}
                </output>
              )}
              {failure ? (
                <div className="space-y-2 px-4 py-6 text-center">
                  <p role="alert">{failure.message ?? t("inbox.loadError")}</p>
                  <Button
                    variant="outline"
                    onClick={() => void load(filter, failure.cursor)}
                  >
                    {t("inbox.actions.retry")}
                  </Button>
                </div>
              ) : (
                showRows &&
                !loading &&
                (feed.nextCursor ? (
                  <div className="flex justify-center p-3">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void load(filter, feed.nextCursor ?? undefined)
                      }
                    >
                      {t("inbox.actions.loadMore")}
                    </Button>
                  </div>
                ) : (
                  !feed.notifications.length && (
                    <output className="block px-4 py-10 text-center text-sm text-muted-foreground">
                      {t(`inbox.empty.${filter}`)}
                    </output>
                  )
                ))
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
