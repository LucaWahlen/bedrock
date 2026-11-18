export const ORGANIZATION_CLAIM = "organization"
export const ROLES_CLAIM = "roles"
export const GROUPS_CLAIM = "groups"

export const OIDC_SCOPE_CLAIMS = [
  {
    scope: "openid",
    claims: ["sub", ORGANIZATION_CLAIM],
  },
  {
    scope: "profile",
    claims: [
      "name",
      "given_name",
      "family_name",
      "preferred_username",
      "picture",
    ],
  },
  {
    scope: "email",
    claims: ["email", "email_verified"],
  },
  {
    scope: "roles",
    claims: [ROLES_CLAIM],
  },
  {
    scope: "groups",
    claims: [GROUPS_CLAIM],
  },
] as const

export const OIDC_CLAIMS_SUPPORTED = [
  "sub",
  "iss",
  "aud",
  "exp",
  "nbf",
  "iat",
  "jti",
  "auth_time",
  "nonce",
  "acr",
  "at_hash",
  "sid",
  "scope",
  "azp",
  "name",
  "given_name",
  "family_name",
  "preferred_username",
  "picture",
  "email",
  "email_verified",
  ORGANIZATION_CLAIM,
  ROLES_CLAIM,
  GROUPS_CLAIM,
] as const
