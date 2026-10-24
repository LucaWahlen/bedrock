import type { createFormatter } from "next-intl"

import type { SecondFactorStanding } from "@/features/account/types"
import type { Translator } from "@/features/shared/lib/i18n/translator"

// What `useFormatter()` and `getFormatter()` both return, of which only the
// list is needed: "Acme and Globex" in the reader's language.
type ListFormatter = Pick<ReturnType<typeof createFormatter>, "list">

function requirement(requiredBy: string[], format: ListFormatter) {
  return {
    organizations: format.list(requiredBy, { type: "conjunction" }),
    count: requiredBy.length,
  }
}

// Why the authenticator app cannot be turned off, or null when it can: some
// organization requires a second factor and no passkey would remain.
export function authenticatorRemovalRefusal(
  standing: SecondFactorStanding,
  t: Translator<"account">,
  format: ListFormatter
): string | null {
  if (standing.requiredBy.length === 0 || standing.passkeyCount > 0) {
    return null
  }

  return t(
    "security.refusal.authenticator",
    requirement(standing.requiredBy, format)
  )
}

// Why a passkey cannot be removed, or null when it can: some organization
// requires a second factor and this is the only one left.
export function passkeyRemovalRefusal(
  standing: SecondFactorStanding,
  t: Translator<"account">,
  format: ListFormatter
): string | null {
  if (
    standing.requiredBy.length === 0 ||
    standing.twoFactorEnabled ||
    standing.passkeyCount > 1
  ) {
    return null
  }

  return t("security.refusal.passkey", requirement(standing.requiredBy, format))
}
