import { useFormatter, useTranslations } from "next-intl"

import { ScrollRegion } from "@/features/shared/components/ui/scroll-region"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/features/shared/components/ui/table"
import { ChartEmpty } from "@/features/usage/components/chart-empty"
import { UsageChangeCell } from "@/features/usage/components/usage-change-cell"
import { UsageSparkline } from "@/features/usage/components/usage-sparkline"
import type { ApplicationUsage } from "@/features/usage/types"

/**
 * Applications ranked by the tokens they were issued, with their share of all
 * tokens, change, daily reach and trend.
 */
export function UsageApplicationsTable({
  applications,
  total,
  empty,
}: {
  applications: ApplicationUsage[]
  // Every token issued in the period, so a share is of the whole.
  total: number
  empty: string
}) {
  const t = useTranslations("usage.applications")
  const format = useFormatter()

  if (applications.length === 0) {
    return <ChartEmpty className="h-40">{empty}</ChartEmpty>
  }

  return (
    // The region scrolls instead of the table's own container, so the
    // scrollbar is the shared one.
    <ScrollRegion className="data-has-overflow-x:pb-2.5 [&_[data-slot=table-container]]:overflow-visible">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">{t("application")}</TableHead>
            <TableHead className="text-right">{t("tokens")}</TableHead>
            <TableHead className="text-right">{t("change")}</TableHead>
            <TableHead className="text-right">{t("users")}</TableHead>
            <TableHead className="hidden w-40 md:table-cell">
              {t("share")}
            </TableHead>
            <TableHead className="hidden sm:table-cell">
              <span className="sr-only">{t("trend")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((application) => {
            const share = total > 0 ? application.tokens.current / total : 0
            return (
              <TableRow key={application.clientId}>
                <TableCell className="max-w-0 truncate font-medium">
                  {application.name ?? (
                    <span className="text-muted-foreground">
                      {t("deleted")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {format.number(application.tokens.current)}
                </TableCell>
                <TableCell className="text-right">
                  <UsageChangeCell {...application.tokens} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {format.number(application.activeUsers, {
                    maximumFractionDigits: 1,
                  })}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${share * 100}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
                      {format.number(share, {
                        style: "percent",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <UsageSparkline values={application.trend} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </ScrollRegion>
  )
}
