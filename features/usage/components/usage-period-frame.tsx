"use client"

import { useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useTransition, type ReactNode } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/features/shared/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/features/shared/components/ui/toggle-group"
import { cn } from "@/features/shared/lib/ui/utils"
import { usageSearchParams } from "@/features/usage/lib/usage-search-params"
import { USAGE_PERIODS, type UsagePeriod } from "@/features/usage/types"

const RANGE_KEYS = {
  7: "week",
  30: "month",
  90: "quarter",
  365: "year",
} as const satisfies Record<UsagePeriod, string>

const isPeriod = (value: number): value is UsagePeriod =>
  (USAGE_PERIODS as readonly number[]).includes(value)

/**
 * The range picker and the figures it governs, as in shadcn's interactive
 * area chart: a toggle group where there is room, a select where there is not.
 * The figures stay in place, dimmed, while the server renders the new range.
 */
export function UsagePeriodFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("usage.range")
  const [isPending, startTransition] = useTransition()
  const [{ period }, setQuery] = useQueryStates(usageSearchParams, {
    shallow: false,
    startTransition,
  })
  const choose = (value: string | null | undefined) => {
    const next = Number(value)
    if (isPeriod(next) && next !== period) void setQuery({ period: next })
  }
  const label = (option: UsagePeriod) => t(RANGE_KEYS[option])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight">
            {label(period)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("comparison", { period })}
          </p>
        </div>
        <ToggleGroup
          aria-label={t("label")}
          variant="outline"
          spacing={0}
          value={[String(period)]}
          onValueChange={(value) => choose(value[0])}
          className="hidden *:data-[slot=toggle-group-item]:px-4! md:flex"
        >
          {USAGE_PERIODS.map((option) => (
            <ToggleGroupItem key={option} value={String(option)}>
              {label(option)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select
          value={String(period)}
          onValueChange={(value) => choose(value)}
          items={USAGE_PERIODS.map((option) => ({
            value: String(option),
            label: label(option),
          }))}
        >
          <SelectTrigger
            size="sm"
            aria-label={t("label")}
            className="w-40 md:hidden"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {USAGE_PERIODS.map((option) => (
              <SelectItem
                key={option}
                value={String(option)}
                className="rounded-lg"
              >
                {label(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        aria-busy={isPending}
        className={cn(
          "flex flex-col gap-4 transition-opacity md:gap-6",
          isPending && "opacity-60"
        )}
      >
        {children}
      </div>
    </>
  )
}
