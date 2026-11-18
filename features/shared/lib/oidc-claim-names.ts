// Namespaced so they cannot collide with a claim the specification later
// reserves, and fixed rather than derived from the issuer URL: deriving them
// would silently rename every claim the day the deployment URL changes.
export const ORGANIZATION_CLAIM = "urn:bedrock:organization"
export const ORGANIZATION_ID_CLAIM = "urn:bedrock:organization_id"
export const ORGANIZATION_NAME_CLAIM = "urn:bedrock:organization_name"
export const ROLES_CLAIM = "urn:bedrock:roles"
export const GROUPS_CLAIM = "urn:bedrock:groups"

export const OIDC_SCOPE_CLAIMS = [
  {
    scope: "openid",
    claims: [
      "sub",
      ORGANIZATION_CLAIM,
      ORGANIZATION_ID_CLAIM,
      ORGANIZATION_NAME_CLAIM,
    ],
  },
  {
    scope: "profile",
    claims: [
      "name",
      "given_name",
      "family_name",
      "preferred_username",
      "picture",
      "locale",
      "updated_at",
    ],
  },
  {
    scope: "email",
    claims: ["email", "email_verified"],
  },
  {
    scope: "roles",
    claims: ["roles", ROLES_CLAIM],
  },
  {
    scope: "groups",
    claims: ["groups", GROUPS_CLAIM],
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
  "locale",
  "updated_at",
  "email",
  "email_verified",
  "roles",
  "groups",
  ORGANIZATION_CLAIM,
  ORGANIZATION_ID_CLAIM,
  ORGANIZATION_NAME_CLAIM,
  ROLES_CLAIM,
  GROUPS_CLAIM,
] as const
