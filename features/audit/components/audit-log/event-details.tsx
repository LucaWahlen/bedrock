"use client"

import { useFormatter, useTranslations } from "next-intl"
import { Fragment } from "react"

import type { AuditEventDisplay } from "@/features/audit/types"
import { describeAuditField } from "@/features/audit/utils/describe-audit-action"

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

type AuditEventDetailsProps = {
  event: AuditEventDisplay
}

export function AuditEventDetails({ event }: AuditEventDetailsProps) {
  const t = useTranslations("audit")
  const tCommon = useTranslations("common")
  const format = useFormatter()

  // Recorded values are statements and stay as written; only their shape is
  // localised.
  function formatValue(value: unknown) {
    if (
      Array.isArray(value) &&
      value.every((item) => typeof item === "string")
    ) {
      return value.length ? format.list(value) : tCommon("states.none")
    }
    if (typeof value === "boolean") {
      return value ? tCommon("values.yes") : tCommon("values.no")
    }
    if (typeof value === "number") return format.number(value)
    if (typeof value !== "string") return JSON.stringify(value)

    return ISO_TIMESTAMP.test(value)
      ? format.dateTime(new Date(value), "preciseDateTime")
      : value
  }

  const isOrganizationTarget = event.targetId === event.organization?.id
  const target = isOrganizationTarget
    ? null
    : (event.targetLabel ?? event.targetId)
  const fields = [
    {
      key: "timestamp",
      label: t("details.timestamp"),
      value: format.dateTime(new Date(event.createdAt), "preciseDateTime"),
    },
    ...(target
      ? [
          {
            key: "target",
            label: describeAuditField(
              t,
              "targets",
              event.targetType ?? "target"
            ),
            value: target,
          },
        ]
      : []),
    ...(event.reason
      ? [{ key: "reason", label: t("details.reason"), value: event.reason }]
      : []),
    ...Object.entries(event.metadata ?? {}).map(([key, value]) => ({
      key: `metadata.${key}`,
      label: describeAuditField(t, "metadata", key),
      value: formatValue(value),
    })),
    ...(event.ipAddress
      ? [{ key: "ip", label: t("details.ipAddress"), value: event.ipAddress }]
      : []),
    ...(event.userAgent
      ? [
          {
            key: "userAgent",
            label: t("details.userAgent"),
            value: event.userAgent,
          },
        ]
      : []),
    { key: "id", label: t("details.eventId"), value: event.id },
  ]

  return (
    <dl className="grid gap-x-6 gap-y-2 py-2 text-sm sm:grid-cols-[max-content_1fr]">
      {fields.map((field) => (
        <Fragment key={field.key}>
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="break-words">{field.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
