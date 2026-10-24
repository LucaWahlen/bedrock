import { ArrowUpRight } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"

import type { MemberApplication } from "@/features/applications/types"
import { IdentityAvatar } from "@/features/shared/components/identity-avatar"

type MemberApplicationListProps = {
  applications: MemberApplication[]
  // Offered to administrators when there is nothing to list yet.
  manageHref?: string
}

const tileClassName =
  "flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-foreground/10"

// Applications as tiles: one that can be launched is a link to it as a whole.
export function MemberApplicationList({
  applications,
  manageHref,
}: MemberApplicationListProps) {
  const t = useTranslations("applications.memberApplications")
  const format = useFormatter()

  if (applications.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("empty")}
        {manageHref && (
          <>
            {" "}
            <Link
              href={manageHref}
              className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {t("setUp")}
            </Link>
          </>
        )}
      </p>
    )
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {applications.map((application) => {
        const roles =
          application.roles.length > 0
            ? format.list(
                application.roles.map((role) => role.name),
                { type: "unit" }
              )
            : t("noRoles")
        const content = (
          <>
            <IdentityAvatar
              seed={application.clientId}
              logo={application.icon}
              name={application.name}
              variant="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{application.name}</p>
              <p className="truncate text-xs text-muted-foreground">{roles}</p>
            </div>
          </>
        )

        return (
          <li key={application.clientId} className="flex min-w-0">
            {application.launchUrl ? (
              <a
                href={application.launchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${tileClassName} group/tile flex-1 outline-none hover:bg-muted/50 hover:ring-foreground/20 focus-visible:ring-[3px] focus-visible:ring-ring/50`}
              >
                {content}
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground group-hover/tile:text-foreground"
                  aria-hidden="true"
                />
                <span className="sr-only">{t("opensInNewTab")}</span>
              </a>
            ) : (
              <div className={`${tileClassName} flex-1`}>{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
