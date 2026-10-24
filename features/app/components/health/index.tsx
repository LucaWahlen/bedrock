import {
  Database,
  HardDrive,
  KeyRound,
  Mail,
  type LucideIcon,
} from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"

import { OverviewSection } from "@/features/app/components/overview/overview-section"
import {
  ConfigurationNotices,
  getHousekeepingStatus,
  getSystemConfiguration,
  HealthCheckRow,
  HealthCheckRowPlaceholder,
  HealthSummary,
  HealthSummaryPlaceholder,
  HousekeepingRow,
  HousekeepingRowPlaceholder,
  RerunChecksButton,
  runHealthCheck,
  type HealthCheckKind,
} from "@/features/health"
import { Card } from "@/features/shared/components/ui/card"
import { ScrollArea } from "@/features/shared/components/ui/scroll-area"

const CHECKS: { kind: HealthCheckKind; icon: LucideIcon }[] = [
  { kind: "database", icon: Database },
  { kind: "storage", icon: HardDrive },
  { kind: "email", icon: Mail },
  { kind: "signingKeys", icon: KeyRound },
]

/**
 * The instance's health for root administrators: a verdict, every dependency
 * as one row, and the configuration worth a second look. Checks start together
 * and each row streams in on its own; the summary waits on the same results.
 */
export async function HealthDashboard() {
  // Read first and quickly: it is the page's own guard as well as its data.
  const [configuration, t] = await Promise.all([
    getSystemConfiguration(),
    getTranslations("health"),
  ])
  const results = CHECKS.map((check) => ({
    ...check,
    label: t(`checks.${check.kind}.label`),
    result: runHealthCheck(check.kind),
  }))
  const housekeeping = getHousekeepingStatus()
  const { build } = configuration

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <Card className="flex-row flex-wrap items-center justify-between gap-4 px-4">
          <Suspense fallback={<HealthSummaryPlaceholder />}>
            <HealthSummary
              results={[...results.map((check) => check.result), housekeeping]}
            />
          </Suspense>
          <RerunChecksButton />
        </Card>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <OverviewSection
              title={t("sections.checks.title")}
              description={t("sections.checks.description")}
            >
              <ul className="-mx-4 -mb-4 divide-y border-t">
                {results.map(({ kind, label, icon, result }) => (
                  <Suspense
                    key={kind}
                    fallback={
                      <HealthCheckRowPlaceholder label={label} icon={icon} />
                    }
                  >
                    <HealthCheckRow label={label} icon={icon} result={result} />
                  </Suspense>
                ))}
                <Suspense fallback={<HousekeepingRowPlaceholder />}>
                  <HousekeepingRow status={housekeeping} />
                </Suspense>
              </ul>
            </OverviewSection>
          </div>
          <div className="min-w-0">
            <OverviewSection
              title={t("sections.configuration.title")}
              description={t("sections.configuration.description")}
            >
              <ConfigurationNotices notices={configuration.notices} />
            </OverviewSection>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("build.version", { version: build.version })} ·{" "}
          {t("build.next", { version: build.nextVersion })}
          {build.commit && (
            <> · {t("build.commit", { commit: build.commit })}</>
          )}
        </p>
      </div>
    </ScrollArea>
  )
}
