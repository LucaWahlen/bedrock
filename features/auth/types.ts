import type { z } from "zod"

import type { createLoginSchema } from "@/features/auth/schemas/login"
import type {
  createNewPasswordSchema,
  createSignUpSchema,
} from "@/features/auth/schemas/sign-up"
import type { createTwoFactorSchema } from "@/features/auth/schemas/two-factor"
import type { organizationStatus } from "@/features/shared/lib/db/schema"
import type { Locale } from "@/features/shared/lib/i18n/config"

export type LoginCredentials = z.infer<ReturnType<typeof createLoginSchema>>

// Where a successful sign-in should land. Someone with a pending invitation to
// the organization they signed in to is not a member yet, so sending them
// straight in would only bounce them off the membership guard.
export type LoginDestination = "organization" | "invitation"

// A correct password from an account with two-factor authentication enabled
// signs nobody in yet: it only earns the chance to enter the second factor.
export type SignInStep = LoginDestination | "two-factor"

export type LoginResult =
  | { success: true; next: SignInStep }
  | { success: false; error: string }

export type TwoFactorMethod = "totp" | "backup_code"

export type TwoFactorInput = z.input<ReturnType<typeof createTwoFactorSchema>>

export type TwoFactorResult =
  | { success: true; next: LoginDestination }
  // `expired` when the pending sign-in itself is gone and only starting over
  // can help, as opposed to a code that was merely wrong.
  | { success: false; error: string; expired?: boolean }

export type PasskeySignInResult = LoginResult

// Where a sign-in ended up once its last factor was proven, before the gate
// has had its say. The token is the new session's, never sent to a browser.
export type EstablishedSignIn = {
  user: { id: string; name: string; email: string }
  sessionToken: string
  setCookieHeaders: string[]
}

// What the gate needs to know about the person and the organization they
// signed in to, read once the session exists.
export type SignInStanding = {
  isMember: boolean
  isInvited: boolean
}

// Why a sign-in was refused: a key into `auth.errors` for the person, beside
// the English `reason` the audit log records as the statement.
export type SignInRefusal = "notMember" | "organizationSuspended" | "incomplete"

export type SignInDecision =
  | { allowed: true; next: LoginDestination; pendingInvitation: boolean }
  | { allowed: false; reason: string; refusal: SignInRefusal }

export type SignUpInput = z.infer<ReturnType<typeof createSignUpSchema>>

export type NewPassword = z.infer<ReturnType<typeof createNewPasswordSchema>>

export type OrganizationRole = "owner" | "admin" | "member"

// Roles that administer an organization, as opposed to merely belonging to it.
export const ORGANIZATION_ADMIN_ROLES = [
  "owner",
  "admin",
] as const satisfies readonly OrganizationRole[]

export type AccessUser = {
  id: string
  name: string
  email: string
  image?: string | null
  // An unverified account may sign in, but may not use anything it belongs to.
  emailVerified: boolean
  // TOTP or at least one passkey. An organization that requires a second factor
  // grants nothing to a member without one until they enrol.
  hasSecondFactor: boolean
  // The interface language they chose, or null to let the browser decide.
  locale: Locale | null
}

// What one membership says about what its holder may do. Branding is not an
// authorization fact and is read by `features/organizations` instead.
export type AccessMembership = {
  organizationId: string
  slug: string
  isRoot: boolean
  status: (typeof organizationStatus.enumValues)[number]
  role: string
  requireTwoFactor: boolean
}

// The server's answer to "who is asking, and what do they belong to". Resolved
// once per request; every guard is a pure function of it.
export type AccessContext = {
  user: AccessUser | null
  memberships: AccessMembership[]
}

export type LoginOrganization = {
  id: string
  name: string
  slug: string
  logo?: string | null
  backgroundImage?: string | null
}
