import { useId } from "react"

import {
  LOCALE_DETAILS,
  type FlagCountry,
  type Locale,
} from "@/features/shared/lib/i18n/config"
import { cn } from "@/features/shared/lib/ui/utils"

// Drawn here rather than taken from a flag package, whose single module of
// every country would land in the client bundle, and rather than emoji, which
// Windows renders as two letters. Each is cropped to 4:3 by `slice`.

function UnitedKingdomFlag() {
  // Clip paths are referenced by id, so each rendered flag needs its own.
  const id = useId()

  return (
    <svg
      viewBox="0 0 60 30"
      preserveAspectRatio="xMidYMid slice"
      className="size-full"
    >
      <clipPath id={`${id}-saltire`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath={`url(#${id}-saltire)`}
        stroke="#C8102E"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  )
}

function GermanyFlag() {
  return (
    <svg
      viewBox="0 0 5 3"
      preserveAspectRatio="xMidYMid slice"
      className="size-full"
    >
      <path d="M0,0 h5 v1 h-5 z" fill="#000" />
      <path d="M0,1 h5 v1 h-5 z" fill="#DD0000" />
      <path d="M0,2 h5 v1 h-5 z" fill="#FFCE00" />
    </svg>
  )
}

const FLAGS: Record<FlagCountry, () => React.JSX.Element> = {
  GB: UnitedKingdomFlag,
  DE: GermanyFlag,
}

// Decorative: the language's name beside it is the label. The ring keeps a
// mostly white flag visible on a light background.
export function LocaleFlag({
  locale,
  className,
}: {
  locale: Locale
  className?: string
}) {
  const Flag = FLAGS[LOCALE_DETAILS[locale].country]

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-3 w-4 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-foreground/15",
        className
      )}
    >
      <Flag />
    </span>
  )
}

// A language as every switcher shows it: its flag and its name for itself,
// marked up in that language so a screen reader pronounces it correctly.
export function LocaleLabel({
  locale,
  className,
}: {
  locale: Locale
  className?: string
}) {
  return (
    <>
      <LocaleFlag locale={locale} />
      <span lang={locale} className={className}>
        {LOCALE_DETAILS[locale].nativeName}
      </span>
    </>
  )
}
