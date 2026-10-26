import { useFormatter, useNow, useTranslations } from "next-intl"

import { AUDIT_OUTCOME_DISPLAY } from "@/features/audit/lib/audit-outcome-display"
import type { AuditEventDisplay } from "@/features/audit/types"
import { describeAuditAction } from "@/features/audit/utils/describe-audit-action"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"
import { badgeVariants } from "@/features/shared/components/ui/badge"
import type { Translator } from "@/features/shared/lib/i18n/translator"

// Who acted, in as few words as the log allows. The display has already
// redacted anyone the reader is not entitled to see.
function actorLabel(t: Translator<"audit">, { actor }: AuditEventDisplay) {
  if (actor.type === "system") return t("actor.platform")
  if (actor.type !== "user") return actor.email ?? t("actor.anonymous")

  return actor.name ?? actor.email ?? t("actor.deletedUser")
}

export function RecentAuditEventList({
  events,
}: {
  events: AuditEventDisplay[]
}) {
  const t = useTranslations("audit")
  const format = useFormatter()
  const now = useNow()

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("recent.empty")}</p>
  }

  return (
    <ul className="-mx-2 flex flex-col">
      {events.map((event) => {
        const outcome = AUDIT_OUTCOME_DISPLAY[event.outcome]
        const OutcomeIcon = outcome.icon
        const actor = actorLabel(t, event)
        const subject =
          event.targetId === event.organization?.id ? null : event.targetLabel
        const createdAt = new Date(event.createdAt)

        return (
          <li key={event.id} className="flex items-center gap-3 px-2 py-2">
            {/* The name is the recorded one; the picture is resolved now, and
                the colour is seeded by the actor's immutable id. */}
            <IdentityAvatar
              seed={event.actor.id}
              logo={event.actor.current?.image}
              name={actor}
              variant="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {describeAuditAction(t, event.action)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[actor, subject].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {event.outcome !== "success" && (
                <span className={badgeVariants({ variant: outcome.variant })}>
                  <OutcomeIcon data-icon="inline-start" aria-hidden="true" />
                  {t(`outcomes.${event.outcome}`)}
                </span>
              )}
              <time
                dateTime={event.createdAt}
                title={format.dateTime(createdAt, "dateTime")}
                className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
              >
                {format.relativeTime(createdAt, now)}
              </time>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
