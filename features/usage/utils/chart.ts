import type { DateTimeFormatOptions } from "next-intl"

// Shades of the organization's own colour, so a chart reads as theirs in light
// and dark mode alike; the strongest goes to the series that matters most.
export const tint = (percent: number) =>
  `color-mix(in oklch, var(--primary) ${percent}%, var(--card))`

export const PALETTE = [
  "var(--primary)",
  tint(62),
  tint(36),
  "var(--muted-foreground)",
  tint(18),
] as const

export const paletteColor = (index: number) =>
  PALETTE[index % PALETTE.length] as string

// Usage days are UTC dates, so they are labelled in UTC too.
export const dayDate = (day: string) => new Date(`${day}T00:00:00Z`)

export function axisDay(period: number): DateTimeFormatOptions {
  return period > 90
    ? { month: "short", timeZone: "UTC" }
    : { month: "short", day: "numeric", timeZone: "UTC" }
}

export const FULL_DAY: DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
}

// A change between two totals as a fraction, or null when it has no meaning.
export function relativeChange(current: number, previous: number | null) {
  if (previous === null || previous === 0) return null
  return (current - previous) / previous
}
