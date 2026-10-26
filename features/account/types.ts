import type { z } from "zod"

import type {
  createAddPasskeySchema,
  createChangeEmailSchema,
  createChangePasswordSchema,
  createDeleteAccountSchema,
  createDisableTwoFactorSchema,
  createEnrollmentCodeSchema,
  createPasswordConfirmationSchema,
  createProfileFormSchema,
  createRenamePasskeySchema,
  createUpdateProfileInputSchema,
} from "@/features/account/schemas/account"

// The sections of the account dialog, in the order its navigation lists them.
// Also the values `?account=` accepts, so a link can open any one of them.
export const ACCOUNT_SECTIONS = [
  "profile",
  "password",
  "email",
  "security",
  "sessions",
  "danger",
] as const

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number]

// One-shot statuses another page can hand the dialog through `?accountNotice=`.
export const ACCOUNT_NOTICES = ["email-changed"] as const

export type AccountNotice = (typeof ACCOUNT_NOTICES)[number]

export type ProfileFormValues = z.infer<
  ReturnType<typeof createProfileFormSchema>
>

export type UpdateProfileInput = z.infer<
  ReturnType<typeof createUpdateProfileInputSchema>
>

export type ChangePasswordInput = z.input<
  ReturnType<typeof createChangePasswordSchema>
>

export type ChangeEmailInput = z.input<
  ReturnType<typeof createChangeEmailSchema>
>

export type DeleteAccountInput = z.infer<
  ReturnType<typeof createDeleteAccountSchema>
>

export type PasswordConfirmationInput = z.infer<
  ReturnType<typeof createPasswordConfirmationSchema>
>

export type ChangePasswordValues = z.output<
  ReturnType<typeof createChangePasswordSchema>
>

export type ChangeEmailValues = z.output<
  ReturnType<typeof createChangeEmailSchema>
>

export type EnrollmentCodeValues = z.output<
  ReturnType<typeof createEnrollmentCodeSchema>
>

export type EnrollmentCodeInput = z.input<
  ReturnType<typeof createEnrollmentCodeSchema>
>

export type DisableTwoFactorInput = z.infer<
  ReturnType<typeof createDisableTwoFactorSchema>
>

export type AddPasskeyInput = z.infer<ReturnType<typeof createAddPasskeySchema>>

export type RenamePasskeyInput = z.infer<
  ReturnType<typeof createRenamePasskeySchema>
>

// Never the public key or credential id: the list is for recognising a device,
// not for anything a browser could replay.
export type AccountPasskey = {
  id: string
  name: string | null
  createdAt: string | null
  // "multiDevice" is a synced passkey, "singleDevice" one bound to hardware.
  deviceType: string
  backedUp: boolean
}

export type SecurityOverview = {
  twoFactorEnabled: boolean
  // Null when two-factor authentication is off.
  backupCodesRemaining: number | null
  passkeys: AccountPasskey[]
  // Names of the organizations that require a second factor of this account,
  // so the last one cannot be given up.
  twoFactorRequiredBy: string[]
}

// What decides whether a factor may be given up.
export type SecondFactorStanding = {
  twoFactorEnabled: boolean
  passkeyCount: number
  requiredBy: string[]
}

// Shown once and never again: the secret and codes exist on the server only
// encrypted, and nothing reads them back to a browser after this.
export type TwoFactorEnrollment = {
  totpURI: string
  secret: string
  backupCodes: string[]
}

export type AccountProfile = {
  id: string
  name: string
  email: string
  image: string | null
}

// An organization the account is the only owner of, which deleting the account
// would leave without one.
export type SoleOwnedOrganization = {
  id: string
  name: string
  slug: string
}

export type AccountOverview = {
  profile: AccountProfile
  soleOwnedOrganizations: SoleOwnedOrganization[]
  // Whether deleting the account also asks for a second factor.
  twoFactorEnabled: boolean
}

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown"

export type DeviceDescription = {
  browser: string | null
  os: string | null
  type: DeviceType
  // "Firefox on macOS", or a fallback when nothing could be recognised. Always
  // English; an interface names the device with `deviceLabel` in its reader's
  // language.
  label: string
}

// Never the token: a list the browser holds must not be a set of credentials.
export type AccountSession = {
  id: string
  device: DeviceDescription
  ipAddress: string | null
  createdAt: string
  lastActiveAt: string
  current: boolean
}

export type DeleteAccountResult =
  | { success: true }
  | {
      success: false
      error: string
      // Set when the refusal is sole ownership, so the dialog can name them.
      soleOwnedOrganizations?: SoleOwnedOrganization[]
    }

// Root deleting someone else's account, refused while it is the last owner of
// an organization.
export type DeleteUserResult =
  | { success: true }
  | {
      success: false
      error: string
      soleOwnedOrganizations?: { id: string; name: string; slug: string }[]
    }
