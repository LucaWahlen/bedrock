import { useFormatter, useTranslations } from "next-intl"
import Link from "next/link"

import { Badge } from "@/features/shared/components/ui/badge"
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
import type { OrganizationRanking } from "@/features/usage/types"

/**
 * The organizations accounting for most of the instance's activity, ranked by
 * the people active there on an average day.
 */
export function UsageOrganizationsTable({
  organizations,
  hrefFor,
  empty,
}: {
  organizations: OrganizationRanking[]
  hrefFor: (organization: OrganizationRanking) => string
  empty: string
}) {
  const t = useTranslations("usage.topOrganizations")
  const format = useFormatter()

  if (organizations.length === 0) {
    return <ChartEmpty className="h-40">{empty}</ChartEmpty>
  }

  return (
    // The region scrolls instead of the table's own container, so the
    // scrollbar is the shared one.
    <ScrollRegion className="data-has-overflow-x:pb-2.5 [&_[data-slot=table-container]]:overflow-visible">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-right">
              <span className="sr-only">{t("rank")}</span>
            </TableHead>
            <TableHead className="w-full">{t("organization")}</TableHead>
            <TableHead className="text-right">{t("activeUsers")}</TableHead>
            <TableHead className="text-right">{t("signIns")}</TableHead>
            <TableHead className="text-right">{t("change")}</TableHead>
            <TableHead className="hidden text-right md:table-cell">
              {t("tokens")}
            </TableHead>
            <TableHead className="hidden sm:table-cell">
              <span className="sr-only">{t("trend")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((organization, index) => (
            <TableRow key={organization.id}>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {format.number(index + 1)}
              </TableCell>
              <TableCell className="max-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={hrefFor(organization)}
                    className="truncate rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {organization.name}
                  </Link>
                  {organization.status === "suspended" && (
                    <Badge variant="outline">{t("suspended")}</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {format.number(organization.activeUsers, {
                  maximumFractionDigits: 1,
                })}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {format.number(organization.signIns.current)}
              </TableCell>
              <TableCell className="text-right">
                <UsageChangeCell {...organization.signIns} />
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {format.number(organization.tokens)}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <UsageSparkline values={organization.trend} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollRegion>
  )
}
