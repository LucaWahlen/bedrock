import type { InvitationRefusal } from "@/features/organizations/types"
import type { Translator } from "@/features/shared/lib/i18n/translator"

// Refusals are stored snake_case; their copy lives under camelCase keys in
// `organizations.invitation.refusals`.
const REFUSAL_KEYS = {
  unknown: "unknown",
  expired: "expired",
  organization_unavailable: "organizationUnavailable",
  already_member: "alreadyMember",
  // Only ever reached without the token: following the mailed link proves the
  // address by itself and confirms the account on the way through.
  unconfirmed_address: "unconfirmedAddress",
} as const satisfies Record<InvitationRefusal, string>

export function invitationRefusal(
  t: Translator<"organizations">,
  refusal: InvitationRefusal
) {
  const key = REFUSAL_KEYS[refusal]

  return {
    title: t(`invitation.refusals.${key}.title`),
    description: t(`invitation.refusals.${key}.description`),
  }
}

export function invitationRefusalMessage(
  t: Translator<"organizations">,
  refusal: InvitationRefusal
) {
  return t(`invitation.refusals.${REFUSAL_KEYS[refusal]}.title`)
}
