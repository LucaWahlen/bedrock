import type { Translator } from "@/features/shared/lib/i18n/translator"

// What a scope actually lets an application see, in the words of the person
// being asked rather than the protocol's.
const SCOPE_DESCRIPTIONS = {
  openid: "scopes.openid",
  profile: "scopes.profile",
  email: "scopes.email",
  roles: "scopes.roles",
  groups: "scopes.groups",
  offline_access: "scopes.offlineAccess",
} as const

function isDescribedScope(
  scope: string
): scope is keyof typeof SCOPE_DESCRIPTIONS {
  return Object.hasOwn(SCOPE_DESCRIPTIONS, scope)
}

export function describeScopes(
  t: Translator<"applications">,
  scope: string | undefined
) {
  const requested = (scope ?? "")
    .split(/\s+/)
    .filter((entry) => entry.length > 0)

  const described = requested.map((entry) =>
    isDescribedScope(entry)
      ? t(SCOPE_DESCRIPTIONS[entry])
      : t("scopes.other", { scope: entry })
  )

  return [...new Set(described)]
}
