import { z } from "zod"

import { isLaunchUrlAllowed } from "@/features/applications/utils/launch-url"
import type { Translator } from "@/features/shared/lib/i18n/translator"

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"]

// How a confidential client proves itself at the token endpoint. Basic is the
// default; post exists for clients that send the secret in the request body
// instead (RustFS, for example, does only that).
export const APPLICATION_TOKEN_AUTH_METHODS = [
  "client_secret_basic",
  "client_secret_post",
] as const

export type ApplicationTokenAuthMethod =
  (typeof APPLICATION_TOKEN_AUTH_METHODS)[number]

export type ClientAuthMethod = ApplicationTokenAuthMethod | "none"

export function isLoopbackRedirectUri(uri: string) {
  const url = URL.parse(uri)
  return url !== null && LOOPBACK_HOSTS.includes(url.hostname)
}

// The provider refuses any loopback redirect URI for a "web" client, so an
// application with one has to be registered as "native" (RFC 8252).
export function oauthApplicationType(redirectUris: string[]) {
  return redirectUris.some(isLoopbackRedirectUri) ? "native" : "web"
}

export function registeredClientAuthMethod(
  isPublic: boolean | undefined,
  confidentialMethod?: ApplicationTokenAuthMethod
): ClientAuthMethod {
  return isPublic ? "none" : (confidentialMethod ?? "client_secret_post")
}

// Every application may end the Bedrock session it signed someone in with,
// which is what makes signing out of it sign them out here too. Without a
// registered post-logout URI they are left on Bedrock's own signed-out page.
export function endSessionSettings(postLogoutRedirectUris?: string[]) {
  return {
    enableEndSession: true,
    postLogoutRedirectUris: postLogoutRedirectUris?.length
      ? postLogoutRedirectUris
      : null,
  }
}

// Exact allowlist, matched literally at authorize time. A wildcard or a prefix
// match is what turns a redirect into an open redirect.
export function createRedirectUriSchema(t: Translator<"applications">) {
  return z
    .url(t("validation.urlInvalid"))
    .max(2000, t("validation.tooLong", { max: 2000 }))
    .refine((value) => !value.includes("#"), {
      message: t("validation.redirectUriFragment"),
    })
    .refine(
      (value) => {
        const url = URL.parse(value)
        if (!url) return false
        if (url.username || url.password) return false
        // The provider accepts loopback only over http, and anything else only
        // over https.
        return (
          url.protocol === (isLoopbackRedirectUri(value) ? "http:" : "https:")
        )
      },
      { message: t("validation.redirectUriScheme") }
    )
}

// The application's launch URL, which the overview links members to.
export function createLaunchUrlSchema(
  t: Translator<"applications">,
  production = process.env.NODE_ENV === "production"
) {
  return z
    .string()
    .trim()
    .max(2000, t("validation.tooLong", { max: 2000 }))
    .refine((value) => isLaunchUrlAllowed(value, production), {
      message: production
        ? t("validation.launchUrlHttps")
        : t("validation.launchUrlHttp"),
    })
}

export function createApplicationSchema(t: Translator<"applications">) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t("validation.nameRequired"))
      .max(100, t("validation.tooLong", { max: 100 })),
    redirectUris: z
      .array(createRedirectUriSchema(t))
      .min(1, t("validation.redirectUrisRequired"))
      .max(20, t("validation.redirectUrisTooMany", { max: 20 })),
    // Where the end-session endpoint may send someone after signing them out,
    // matched exactly like a redirect URI. None means it stays on Bedrock.
    postLogoutRedirectUris: z
      .array(createRedirectUriSchema(t))
      .max(20, t("validation.redirectUrisTooMany", { max: 20 }))
      .optional(),
    uri: createLaunchUrlSchema(t).nullish(),
    isPublic: z.boolean().optional(),
    skipConsent: z.boolean().optional(),
    // Ignored for public clients, which authenticate with nothing.
    tokenEndpointAuthMethod: z.enum(APPLICATION_TOKEN_AUTH_METHODS).optional(),
  })
}

export function createApplicationRoleSchema(t: Translator<"applications">) {
  return z.object({
    key: z
      .string()
      .trim()
      .min(1, t("validation.roleKeyRequired"))
      .max(64, t("validation.tooLong", { max: 64 }))
      .regex(
        /^[A-Za-z0-9]+(?:[-_:][A-Za-z0-9]+)*$/,
        t("validation.roleKeyFormat")
      ),
    name: z
      .string()
      .trim()
      .min(1, t("validation.roleNameRequired"))
      .max(100, t("validation.tooLong", { max: 100 })),
    description: z
      .string()
      .trim()
      .max(500, t("validation.tooLong", { max: 500 }))
      .nullish(),
    clientIds: z
      .array(z.string().min(1, t("errors.unknownApplication")))
      .max(100, t("validation.applicationsTooMany", { max: 100 })),
    memberUserIds: z
      .array(z.string().min(1, t("errors.notMember")))
      .max(500, t("validation.membersTooMany", { max: 500 }))
      .optional(),
  })
}

// Identifiers only, never typed by anyone: the actions answer a failure with
// their own message, so these carry none.
export const memberRolesSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  roleIds: z.array(z.string().min(1)).max(100),
})

export const roleMembersSchema = z.object({
  organizationId: z.string().min(1),
  roleId: z.string().min(1),
  add: z.array(z.string().min(1)).max(500),
  remove: z.array(z.string().min(1)).max(500),
})

export const roleGroupsSchema = z.object({
  organizationId: z.string().min(1),
  roleId: z.string().min(1),
  groupIds: z.array(z.string().min(1)).max(100),
})
