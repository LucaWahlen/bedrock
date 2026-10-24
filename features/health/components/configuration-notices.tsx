import { CircleCheck, Info, TriangleAlert } from "lucide-react"
import { useTranslations } from "next-intl"

import type { ConfigurationNotice } from "@/features/health/types"

export function ConfigurationNotices({
  notices,
}: {
  notices: ConfigurationNotice[]
}) {
  const t = useTranslations("health.sections.configuration")

  if (notices.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-emerald-500" aria-hidden="true" />
        {t("empty")}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-4">
      {notices.map((notice) => {
        const Icon = notice.severity === "warning" ? TriangleAlert : Info

        return (
          <li key={notice.id} className="flex gap-2.5">
            <Icon
              className={
                notice.severity === "warning"
                  ? "mt-0.5 size-4 shrink-0 text-amber-500"
                  : "mt-0.5 size-4 shrink-0 text-muted-foreground"
              }
              aria-hidden="true"
            />
            <div className="grid gap-0.5">
              <p className="text-sm font-medium">
                <span className="sr-only">
                  {notice.severity === "warning"
                    ? t("warning")
                    : t("note")}{" "}
                </span>
                {notice.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {notice.description}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
