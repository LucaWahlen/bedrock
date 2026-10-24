"use client"

import { useFormatter, useTranslations } from "next-intl"

import { TrustedBadge } from "@/features/applications/components/trusted-badge"
import type { Application } from "@/features/applications/types"
import { IdentityLabel } from "@/features/shared/components/identity-label"
import { Badge } from "@/features/shared/components/ui/badge"

export function ApplicationNameCell({
  application,
}: {
  application: Application
}) {
  const t = useTranslations("applications.badges")

  return (
    <div className="flex items-center gap-2">
      <IdentityLabel
        name={application.name}
        avatar={{ seed: application.clientId, logo: application.icon }}
      />
      {application.disabled && (
        <Badge variant="secondary">{t("disabled")}</Badge>
      )}
      {application.skipConsent && <TrustedBadge />}
    </div>
  )
}

export function ApplicationTypeCell({
  application,
}: {
  application: Application
}) {
  const t = useTranslations("applications.types")

  return (
    <span className="text-sm text-muted-foreground">
      {t(application.isConfidential ? "confidential" : "public")}
    </span>
  )
}

export function CreatedCell({ createdAt }: { createdAt: string | null }) {
  const format = useFormatter()

  return createdAt ? (
    <time dateTime={createdAt}>
      {format.dateTime(new Date(createdAt), "date")}
    </time>
  ) : (
    <span className="text-muted-foreground">—</span>
  )
}
