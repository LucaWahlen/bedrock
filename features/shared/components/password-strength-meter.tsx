"use client"

import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

import {
  assessPassword,
  MINIMUM_PASSWORD_LENGTH,
  PASSWORD_STRENGTHS,
  type PasswordAssessment,
  type PasswordHintKey,
  type PasswordStrength,
} from "@/features/shared/lib/password-strength"
import { cn } from "@/features/shared/lib/ui/utils"

// The two bands below the accepted minimum share the refusing colour, so the
// meter and the error say the same thing.
const SEGMENT_COLORS: Record<PasswordStrength, string> = {
  "very-weak": "bg-destructive",
  weak: "bg-destructive",
  fair: "bg-amber-500",
  good: "bg-lime-500",
  strong: "bg-emerald-500",
}

const STRENGTH_LABELS = {
  "very-weak": "veryWeak",
  weak: "weak",
  fair: "fair",
  good: "good",
  strong: "strong",
} as const satisfies Record<PasswordStrength, string>

const TEXT_COLORS: Record<PasswordStrength, string> = {
  "very-weak": "text-destructive",
  weak: "text-destructive",
  fair: "text-amber-600 dark:text-amber-400",
  good: "text-lime-600 dark:text-lime-400",
  strong: "text-emerald-600 dark:text-emerald-400",
}

export function PasswordStrengthMeter({
  password,
  name,
  email,
  className,
}: {
  password: string
  // Given to zxcvbn as known inputs, so a password built out of the person's
  // own details scores as badly as it deserves.
  name?: string
  email?: string
  className?: string
}) {
  const t = useTranslations("common.password")
  const [assessment, setAssessment] = useState<PasswordAssessment | null>(null)

  // Clearing the field forgets the last result, so the next password starts
  // from the empty state rather than from the score of the one before it.
  if (!password && assessment) setAssessment(null)

  useEffect(() => {
    if (!password) return

    // The dictionaries load on first use, so an early result can arrive after a
    // later one. Only the most recent request is allowed to win.
    let current = true
    assessPassword(password, { name, email }).then((next) => {
      if (current) setAssessment(next)
    })

    return () => {
      current = false
    }
  }, [password, name, email])

  // Held until the first assessment arrives, which is also the empty state: the
  // meter occupies its space from the outset so nothing below it jumps when
  // typing starts or when the dictionaries finish loading.
  const assessed = password ? assessment : null
  const label = assessed && t(`strength.${STRENGTH_LABELS[assessed.strength]}`)
  const hint = assessed && translateHint(assessed.hintKey, assessed.hint)

  // zxcvbn may say something no catalogue knows yet; English beats nothing.
  function translateHint(key: PasswordHintKey | null, fallback: string | null) {
    if (!key) return fallback
    if (key === "tooShort") {
      return t("hints.tooShort", { minimum: MINIMUM_PASSWORD_LENGTH })
    }
    const messageKey = `hints.${key}` as const
    if (!t.has(messageKey as never)) return fallback

    return t(messageKey as never)
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex gap-1" aria-hidden="true">
        {PASSWORD_STRENGTHS.map((segment, index) => (
          <div
            key={segment}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              assessed && index <= assessed.score
                ? SEGMENT_COLORS[assessed.strength]
                : "bg-border"
            )}
          />
        ))}
      </div>
      <p className="text-xs" aria-live="polite">
        {assessed ? (
          <>
            {/* The hints are whole sentences, so the label ends as one too. */}
            <span className={cn("font-medium", TEXT_COLORS[assessed.strength])}>
              {hint ? `${label}.` : label}
            </span>
            {hint && <span className="text-muted-foreground"> {hint}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">
            {t("requirement", { minimum: MINIMUM_PASSWORD_LENGTH })}
          </span>
        )}
      </p>
    </div>
  )
}
