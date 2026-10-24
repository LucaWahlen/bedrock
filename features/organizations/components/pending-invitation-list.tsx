import { useFormatter, useNow, useTranslations } from "next-intl"

import type { PendingInvitationSummary } from "@/features/organizations/types"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"

// A tag renderer for `t.rich`, built outside the component so it is not a new
// component type on every render.
function time(dateTime: string, title: string) {
  return function Time(chunks: React.ReactNode) {
    return (
      <time dateTime={dateTime} title={title}>
        {chunks}
      </time>
    )
  }
}

export function PendingInvitationList({
  invitations,
}: {
  invitations: PendingInvitationSummary[]
}) {
  const t = useTranslations("organizations")
  const format = useFormatter()
  const now = useNow()

  if (invitations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("pendingInvitations.empty")}
      </p>
    )
  }

  return (
    <ul className="-mx-2 flex flex-col">
      {invitations.map((invitation) => {
        const expiresAt = new Date(invitation.expiresAt)

        return (
          <li key={invitation.id} className="flex items-center gap-3 px-2 py-2">
            <IdentityAvatar
              seed={invitation.id}
              name={invitation.email}
              variant="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{invitation.email}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t(`roles.${invitation.role}.label`)}
              </p>
            </div>
            <p className="shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground">
              {t.rich("pendingInvitations.expires", {
                date: format.relativeTime(expiresAt, now),
                time: time(
                  invitation.expiresAt,
                  format.dateTime(expiresAt, "dateTime")
                ),
              })}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
