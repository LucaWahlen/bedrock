import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/features/shared/components/ui/card"

// The frame renders at once; the total and the chart arrive together.
export function ActivityCard({
  usageHref,
  description,
  children,
}: {
  usageHref: string
  description: ReactNode
  children: ReactNode
}) {
  const t = useTranslations("app.overview.activity")

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Link
            href={usageHref}
            className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {t("viewUsage")}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">{children}</CardContent>
    </Card>
  )
}
