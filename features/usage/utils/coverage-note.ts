import type { Translator } from "@/features/shared/lib/i18n/translator"
import type { UsageCoverage } from "@/features/usage/types"

// Said only when the period is not fully rolled up, so a short chart is not
// mistaken for a quiet one.
export function coverageNote(
  t: Translator<"usage">,
  { rolledUpDays, pastDays }: UsageCoverage
) {
  if (rolledUpDays >= pastDays) return undefined
  if (rolledUpDays === 0) return t("coverage.todayOnly")

  return t("coverage.partial", { missing: pastDays - rolledUpDays })
}
