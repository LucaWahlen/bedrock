import { oauthProvider } from "@better-auth/oauth-provider"
import { passkey } from "@better-auth/passkey"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { betterAuth } from "better-auth/minimal"
import { nextCookies } from "better-auth/next-js"
import { jwt, organization, twoFactor } from "better-auth/plugins"

import { accountDisabledError } from "@/features/auth/lib/account-disabled"
import {
  sendResetPasswordMail,
  sendVerificationMail,
} from "@/features/auth/lib/auth-emails"
import { authRateLimitStorage } from "@/features/auth/lib/auth-rate-limit-storage"
import { oidcAuthorizationGate } from "@/features/auth/lib/oidc-authorization-gate"
import { organizationAdditionalFields } from "@/features/auth/lib/organization-schema"
import { isRootAdministrator } from "@/features/auth/utils/access"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { currentOAuthClientOwner } from "@/features/shared/lib/oauth-client-owner"

export const OIDC_SCOPES = [
  "openid",
  "profile",
  "email",
  "roles",
  "groups",
] as const

// RS256 is what every relying party accepts. EdDSA, the plugin default, is
// refused by Cloudflare Access among others.
export const OIDC_SIGNING_ALGORITHM = "RS256"

// Namespaced so they cannot collide with a claim the specification later
// reserves, and fixed rather than derived from the issuer URL: deriving them
// would silently rename every claim the day the deployment URL changes.
export const ORGANIZATION_CLAIM = "urn:bedrock:organization"
export const ROLES_CLAIM = "urn:bedrock:roles"
export const GROUPS_CLAIM = "urn:bedrock:groups"

// Imported at call time, like the access context below. A static import would
// pull the database client into every chunk this module lands in, where the
// bundler stubs it and leaves its exports undefined at runtime.
async function applicationAccess(userId: string, clientId: string) {
  const { resolveApplicationAccess } =
    await import("@/features/shared/lib/oidc-claims")

  return resolveApplicationAccess(userId, clientId)
}

// What every token and the userinfo response say about the member, so the three
// cannot drift apart. Roles and groups each need their own scope.
function applicationClaims(
  access: Awaited<ReturnType<typeof applicationAccess>>,
  scopes: readonly string[]
) {
  return {
    [ORGANIZATION_CLAIM]: access.organizationSlug,
    ...(scopes.includes("roles") ? { [ROLES_CLAIM]: access.roles } : {}),
    ...(scopes.includes("groups") ? { [GROUPS_CLAIM]: access.groups } : {}),
  }
}

// The claim callbacks are given the client's metadata rather than its id, so
// the id stamped there at registration is the only link back to the
// application. Without it nothing can be scoped, so nothing is issued.
function applicationClientId(metadata?: Record<string, unknown>) {
  const clientId = metadata?.clientId

  if (typeof clientId !== "string" || clientId.length === 0) {
    throw new Error("Application is not registered with Bedrock")
  }

  return clientId
}

// Passkeys are bound to this host for good: an authenticator only offers a
// credential to the relying party it was created for, so moving the instance to
// another domain leaves every registered passkey unusable.
const relyingParty = new URL(env.auth.url)

export const auth = betterAuth({
  secret: env.auth.secret,
  baseURL: env.auth.url,
  // The JWT plugin's own token endpoint mints a session-backed JWT for any
  // signed-in browser. Nothing here wants that, and it is not the OAuth
  // `/oauth2/token`.
  disabledPaths: ["/token"],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: sendResetPasswordMail,
    // A reset is how an account is recovered after it is lost, so whoever held
    // it is signed out rather than left with a live session.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendVerificationEmail: sendVerificationMail,
    // Sent by the sign-up action instead, which knows which organization the
    // link has to come back to. An invited account never needs one.
    sendOnSignUp: false,
    expiresIn: 60 * 60 * 24,
  },
  user: {
    // Driven by the account feature's `changeEmail` action, which rechecks the
    // password first. The link goes to the new address through the verification
    // mail above, and the address only changes once it is followed.
    //
    // `deleteUser` stays off: deletion is a guarded transaction that refuses a
    // last owner and audits, and an HTTP route must not offer a way around it.
    changeEmail: { enabled: true },
    // Read so mail can be written in the person's language. Never taken as
    // input here: the account feature's `setLocale` validates and writes it.
    additionalFields: {
      locale: { type: "string", required: false, input: false },
    },
  },
  // Only applies to Better Auth's HTTP router, which is not mounted today: all
  // auth goes through server actions calling `auth.api`, and those enforce
  // their own limits. This takes effect if an `/api/auth/*` handler is added.
  rateLimit: {
    customStorage: authRateLimitStorage,
  },
  hooks: {
    before: oidcAuthorizationGate,
  },
  databaseHooks: {
    session: {
      create: {
        // Every way of signing in ends in a session, and a disabled account may
        // hold none: not after a password, a second factor or a passkey, and
        // not after a password reset either. Runs only once the credential has
        // been checked, so it reveals nothing to someone without it.
        before: async (session) => {
          const { isAccountDisabled } =
            await import("@/features/auth/actions/is-account-disabled")
          if (await isAccountDisabled(session.userId)) {
            throw accountDisabledError()
          }
        },
      },
    },
  },
  plugins: [
    organization({
      // Imported at call time: the access context reads the session from this
      // module, and this value is initialized at module scope.
      allowUserToCreateOrganization: async () => {
        const { getAccessContext } =
          await import("@/features/auth/actions/get-access-context")

        return isRootAdministrator(await getAccessContext())
      },
      // Deletion belongs to the guarded `deleteOrganization` action, which
      // soft-deletes and audits. Mounting any HTTP route must not re-expose a
      // hard delete that skips both.
      disableOrganizationDeletion: true,
      schema: {
        organization: {
          additionalFields: organizationAdditionalFields,
        },
      },
    }),
    jwt({
      jwks: {
        keyPairConfig: { alg: OIDC_SIGNING_ALGORITHM, modulusLength: 2048 },
      },
    }),
    oauthProvider({
      loginPage: "/oauth2/login",
      consentPage: "/oauth2/consent",
      scopes: [...OIDC_SCOPES],
      // Sign-in only. `client_credentials` would make an application an actor
      // in its own right, and `refresh_token` needs `offline_access`, which is
      // not offered. Both are advertised in discovery unless narrowed here.
      grantTypes: ["authorization_code"],
      // Registration is an authenticated, audited action in the applications
      // feature. An open endpoint would let anyone create a client.
      allowDynamicClientRegistration: false,
      storeClientSecret: "hashed",
      advertisedMetadata: {
        claims_supported: [ORGANIZATION_CLAIM, ROLES_CLAIM, GROUPS_CLAIM],
      },
      // Every claim callback throws for someone who is not a current member of
      // the organization owning the application. A throw here refuses the
      // token, which is the point: a live Bedrock session is not by itself
      // permission to enter a tenant's application.
      customIdTokenClaims: async ({ user, scopes, metadata }) => {
        const access = await applicationAccess(
          user.id,
          applicationClientId(metadata)
        )

        return applicationClaims(access, scopes)
      },
      customAccessTokenClaims: async ({ user, scopes, metadata }) => {
        if (!user) return {}

        const access = await applicationAccess(
          user.id,
          applicationClientId(metadata)
        )

        return applicationClaims(access, scopes)
      },
      // The access token names its client, which is all userinfo has to go on.
      // The membership is resolved again here rather than read from the token,
      // so a member who has since left is refused rather than described.
      customUserInfoClaims: async ({ user, scopes, jwt: token }) => {
        const clientId = token.client_id ?? token.azp

        if (typeof clientId !== "string" || clientId.length === 0) {
          throw new APIError("UNAUTHORIZED", {
            error: "invalid_token",
            error_description: "Access token names no application",
          })
        }

        try {
          return applicationClaims(
            await applicationAccess(user.id, clientId),
            scopes
          )
        } catch (error) {
          throw new APIError("UNAUTHORIZED", {
            error: "invalid_token",
            error_description:
              error instanceof Error ? error.message : "Access refused",
          })
        }
      },
      // One session row holds one active organization, which cannot describe a
      // user with two tabs open in two organizations. The owner is taken from
      // the request instead, and its absence refuses rather than guesses.
      clientReference: () => currentOAuthClientOwner(),
      clientPrivileges: async ({ user }) => {
        const organizationId = currentOAuthClientOwner()
        if (!user || !organizationId) return false

        const [{ getAccessContext }, { membershipIn }, { hasRole }] =
          await Promise.all([
            import("@/features/auth/actions/get-access-context"),
            import("@/features/auth/utils/access"),
            import("@/features/auth/lib/member-role"),
          ])

        const membership = membershipIn(
          await getAccessContext(),
          organizationId
        )

        return Boolean(
          membership &&
          membership.status === "active" &&
          hasRole(membership.role, "owner", "admin")
        )
      },
    }),
    // Driven only by the account and sign-in actions, which recheck the
    // password, throttle, and audit. Nothing here is reachable over HTTP.
    twoFactor({
      issuer: env.rootOrganization.name,
    }),
    passkey({
      rpID: relyingParty.hostname,
      rpName: env.rootOrganization.name,
      // Fixed rather than taken from the request's Origin header, so a response
      // produced for any other site is refused.
      origin: relyingParty.origin,
    }),
    nextCookies(),
  ],
})
