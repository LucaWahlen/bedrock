"use client"

import { useFormatter, useTranslations } from "next-intl"

const DAY = 24 * 60 * 60 * 1000

function daysSince(value: string) {
  return Math.floor((Date.now() - new Date(value).getTime()) / DAY)
}

// Activity is only tracked daily, so anything finer would claim more than the
// value knows.
export function LastActive({ value }: { value: string | null }) {
  const t = useTranslations("organizations.activity")
  const format = useFormatter()

  if (!value) {
    return <span className="text-muted-foreground">{t("never")}</span>
  }

  const date = new Date(value)
  const days = daysSince(value)

  return (
    <time dateTime={value} title={format.dateTime(date, "preciseDateTime")}>
      {days <= 0
        ? t("today")
        : days === 1
          ? t("yesterday")
          : days < 30
            ? t("daysAgo", { count: days })
            : format.dateTime(date, "date")}
    </time>
  )
}
