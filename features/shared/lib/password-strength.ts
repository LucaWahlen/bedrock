import type { ZxcvbnResult } from "@zxcvbn-ts/core"
import type { z } from "zod"

// Strength is estimated with zxcvbn, which counts how many guesses a password
// would actually take rather than whether it contains a digit. Composition
// rules push people towards `P@ssw0rd1`, which looks varied and falls in
// seconds; zxcvbn knows that, along with the dictionary words, keyboard walks,
// dates and l33t substitutions behind it.

export const PASSWORD_STRENGTHS = [
  "very-weak",
  "weak",
  "fair",
  "good",
  "strong",
] as const

export type PasswordStrength = (typeof PASSWORD_STRENGTHS)[number]

export type PasswordScore = 0 | 1 | 2 | 3 | 4

// Names the hint for translation: `common.password.hints.<key>`. zxcvbn's own
// feedback is keyed by its English text, so an unknown one has no key.
export type PasswordHintKey =
  | "tooShort"
  | "moreWords"
  | `warnings.${string}`
  | `suggestions.${string}`

export type PasswordAssessment = {
  score: PasswordScore
  strength: PasswordStrength
  label: string
  // What would most improve it, or null when there is nothing worth saying.
  // English; translate `hintKey` to show it in the reader's language.
  hint: string | null
  hintKey: PasswordHintKey | null
}

export type PasswordContext = {
  email?: string
  name?: string
  organizationName?: string
}

export const MINIMUM_PASSWORD_LENGTH = 8

// zxcvbn's own guidance: below 2 a password falls to an online attack even
// through rate limiting. Above it the meter advises rather than forbids.
export const MINIMUM_PASSWORD_SCORE = 2

const LABELS: Record<PasswordStrength, string> = {
  "very-weak": "Very weak",
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
}

type Engine = {
  check: (password: string, userInputs?: (string | number)[]) => ZxcvbnResult
  hintKeys: Map<string, PasswordHintKey>
}

let engine: Promise<Engine> | undefined

// The dictionaries are far larger than the code using them, so they are fetched
// on first use rather than riding along in every page with a password field.
function loadEngine() {
  engine ??= (async () => {
    const [{ ZxcvbnFactory }, common, english] = await Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      import("@zxcvbn-ts/language-en"),
    ])

    const factory = new ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...english.dictionary },
      graphs: common.adjacencyGraphs,
      translations: english.translations,
    })
    const hintKeys = new Map<string, PasswordHintKey>()
    for (const group of ["warnings", "suggestions"] as const) {
      for (const [key, text] of Object.entries(english.translations[group])) {
        hintKeys.set(text, `${group}.${key}`)
      }
    }

    return {
      check: (password: string, inputs?: (string | number)[]) =>
        factory.check(password, inputs),
      hintKeys,
    }
  })()

  return engine
}

/** Anything from the person's own identity is public knowledge to an attacker. */
function userInputs(context: PasswordContext) {
  const email = context.email?.trim().toLowerCase() ?? ""

  return [
    email,
    email.split("@")[0],
    ...(context.name ?? "").split(/\s+/),
    ...(context.organizationName ?? "").split(/\s+/),
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function assessment(
  score: PasswordScore,
  hint: string | null,
  hintKey: PasswordHintKey | null
): PasswordAssessment {
  const strength = PASSWORD_STRENGTHS[score]

  return { score, strength, label: LABELS[strength], hint, hintKey }
}

export async function assessPassword(
  password: string,
  context: PasswordContext = {}
): Promise<PasswordAssessment> {
  // zxcvbn rates a short password on guessability alone, which can flatter it.
  // The floor is ours to state.
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return assessment(
      0,
      `Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      "tooShort"
    )
  }

  const zxcvbn = await loadEngine()
  const result = zxcvbn.check(password, userInputs(context))
  const score = result.score as PasswordScore
  const { warning, suggestions } = result.feedback

  const feedback = warning || suggestions[0]
  if (feedback) {
    return assessment(score, feedback, zxcvbn.hintKeys.get(feedback) ?? null)
  }

  return score === 4
    ? assessment(score, null, null)
    : assessment(score, "A few more words would make it stronger.", "moreWords")
}

/**
 * The line the forms refuse to cross, shared by every schema that sets a
 * password so the meter and the validation cannot disagree.
 */
export async function refuseWeakPassword(
  value: { password: string; name?: string; email?: string },
  ctx: z.RefinementCtx
) {
  // Too short has already been reported by the field's own rule, and saying it
  // twice helps nobody.
  if (value.password.length < MINIMUM_PASSWORD_LENGTH) return

  const { score, hint } = await assessPassword(value.password, {
    name: value.name,
    email: value.email,
  })

  if (score < MINIMUM_PASSWORD_SCORE) {
    ctx.addIssue({
      code: "custom",
      path: ["password"],
      message: hint ?? "Choose a password that is harder to guess",
    })
  }
}
