import { relations, sql } from "drizzle-orm"
import {
  pgTable,
  pgEnum,
  bigint,
  integer,
  jsonb,
  text,
  timestamp,
  boolean,
  check,
  date,
  foreignKey,
  index,
  primaryKey,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const organizationStatus = pgEnum("organization_status", [
  "active",
  "suspended",
  "deleted",
])

export const auditActorType = pgEnum("audit_actor_type", [
  "user",
  "system",
  "anonymous",
])

export const auditOutcome = pgEnum("audit_outcome", [
  "success",
  "failure",
  "denied",
])

// How far an event travels. "tenant" never leaves the organization it belongs
// to, not even to a root administrator; "platform" is also instance-visible.
// Recorded rather than re-derived on read, so changing the rule cannot silently
// expose history that was written as a tenant's own.
export const auditScope = pgEnum("audit_scope", ["tenant", "platform"])

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // The interface language the person chose, one of `LOCALES`. Null until they
  // choose, so the cookie and the browser decide instead.
  locale: text("locale"),
  lastActiveAt: timestamp("last_active_at"),
  // Owned by the two-factor plugin. Only true once a code has been verified, so
  // an abandoned enrolment never asks anyone for a second factor.
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  // Set by a root administrator or `bun run admin`. A disabled account cannot
  // hold a session, so nothing it belongs to can be reached. `disabledBy` is a
  // plain id, like an audit reference: the administrator may be gone later.
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),
  disabledBy: text("disabled_by"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull(),
})

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
)

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
)

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
)

// The two-factor plugin's TOTP secret and backup codes, both encrypted with the
// auth secret. Field names track its declared schema. One row per user: the
// plugin reads it with `findOne`, so a second row would be ignored, not used.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (table) => [
    uniqueIndex("two_factor_userId_uidx").on(table.userId),
    index("two_factor_secret_idx").on(table.secret),
  ]
)

// WebAuthn credentials, owned by the passkey plugin. A credential id names one
// key on one authenticator, so it can only ever belong to one account.
export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at"),
    aaguid: text("aaguid"),
  },
  (table) => [
    index("passkey_userId_idx").on(table.userId),
    uniqueIndex("passkey_credentialID_uidx").on(table.credentialID),
  ]
)

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
    isRoot: boolean("is_root").default(false).notNull(),
    status: organizationStatus("status").default("active").notNull(),
    statusChangedAt: timestamp("status_changed_at"),
    statusChangedBy: text("status_changed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    // When the organization stopped existing for its members. The moment it is
    // purged is derived from this and the retention setting, so changing that
    // setting moves every pending purge with it.
    deletedAt: timestamp("deleted_at"),
    color: text("color"),
    backgroundImage: text("background_image"),
    favicon: text("favicon"),
    allowPublicSignUp: boolean("allow_public_sign_up").default(false).notNull(),
    // Members must hold a second factor, TOTP or a passkey, to use anything
    // the organization offers. Changed by its owners alone.
    requireTwoFactor: boolean("require_two_factor").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("organization_slug_uidx").on(table.slug),
    uniqueIndex("organization_single_root_uidx")
      .on(table.isRoot)
      .where(sql`${table.isRoot} = true`),
    index("organization_deleted_idx")
      .on(table.deletedAt)
      .where(sql`${table.status} = 'deleted'`),
    check(
      "organization_root_active_check",
      sql`not ${table.isRoot} or ${table.status} = 'active'`
    ),
    check(
      "organization_deleted_at_check",
      sql`(${table.status} = 'deleted') = (${table.deletedAt} is not null)`
    ),
    // The instance administrators are never self-service, whatever a future
    // settings page offers a tenant.
    check(
      "organization_root_invite_only_check",
      sql`not ${table.isRoot} or not ${table.allowPublicSignUp}`
    ),
  ]
)

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
    uniqueIndex("member_organizationId_userId_uidx").on(
      table.organizationId,
      table.userId
    ),
    // What a composite foreign key from a group membership points at, so the
    // database itself refuses a member of one organization in another's group.
    unique("member_id_organizationId_unique").on(
      table.id,
      table.organizationId
    ),
  ]
)

// Open invitations only. Accepting, withdrawing or letting one lapse removes
// the row, because none of those leave any work to do: who was invited, by whom
// and what came of it is in the audit log, and a row that outlives its purpose
// is just somebody's address kept for no reason.
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Only the digest is stored. A database dump is then not a stack of usable
    // invitation links, and the raw token exists solely in the mail we sent.
    tokenHash: text("token_hash").notNull(),
    lastSentAt: timestamp("last_sent_at").notNull(),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
    uniqueIndex("invitation_tokenHash_uidx").on(table.tokenHash),
    // One open invitation per address per organization, so a double-submitted
    // dialog cannot produce two valid tokens for the same seat.
    uniqueIndex("invitation_recipient_uidx").on(
      table.organizationId,
      sql`lower(${table.email})`
    ),
    index("invitation_expiry_idx").on(table.expiresAt),
  ]
)

// A root administrator acting as an organization's owner for a bounded time and
// a stated reason. Never a membership: tokens and claims read `member` and so
// never see it, and it grants nothing once it has ended or expired. Ended rows
// are kept; what was done under them is in the audit log.
export const breakGlassGrant = pgTable(
  "break_glass_grant",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => [
    index("break_glass_grant_userId_idx").on(table.userId),
    // One open grant per administrator and organization, so a double-submitted
    // dialog cannot stack two windows.
    uniqueIndex("break_glass_grant_open_uidx")
      .on(table.userId, table.organizationId)
      .where(sql`${table.endedAt} is null`),
  ]
)

// Append-only. Rows are never updated or deleted, so references are recorded as
// plain values rather than foreign keys: `on delete set null` would rewrite
// history, and an event describes a subject as it was, not as it still is.
export const auditEvent = pgTable(
  "audit_event",
  {
    // event
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    action: text("action").notNull(),
    outcome: auditOutcome("outcome").default("success").notNull(),
    scope: auditScope("scope").default("tenant").notNull(),

    // actor
    actorType: auditActorType("actor_type").default("user").notNull(),
    actorUserId: text("actor_user_id"),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    // The membership whose authority the actor used, so root administration is
    // distinguishable from action taken by a member of the subject
    // organization. Null when no authority was used at all: signing up,
    // accepting an invitation and joining an open organization are done by
    // someone who is not a member yet and is acting only for themselves.
    actorOrganizationId: text("actor_organization_id"),

    // organization
    organizationId: text("organization_id"),
    organizationName: text("organization_name"),
    organizationSlug: text("organization_slug"),

    // target
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetLabel: text("target_label"),

    // context
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("audit_event_createdAt_idx").on(table.createdAt),
    index("audit_event_organizationId_createdAt_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("audit_event_actorUserId_createdAt_idx").on(
      table.actorUserId,
      table.createdAt
    ),
    index("audit_event_target_createdAt_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt
    ),
    // The instance log reads every platform event, newest first.
    index("audit_event_scope_createdAt_idx").on(table.scope, table.createdAt),
    check(
      "audit_event_action_format_check",
      sql`${table.action} ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'`
    ),
  ]
)

// Counters for both rate-limited paths. Keys are namespaced by their caller,
// and rows are reused per key, so growth is bounded by distinct keys.
// Deliberately indexed on the primary key only: `last_request` changes on
// almost every write, so a second index would cost every request an index
// update to speed up an hourly prune over a small table.
export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  // Epoch milliseconds, matching the shape Better Auth's storage expects.
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
})

// Signing keys for ID tokens and JWT access tokens, owned by the JWT plugin.
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
})

// The next six tables belong to the OAuth provider plugin. Field names track
// its declared schema exactly; it refuses to start when one is missing.
export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled"),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean(
      "backchannel_logout_session_required"
    ),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens"),
    // The plugin treats this as an opaque owner id. Here it is always an
    // organization, and the foreign key is what stops a purged tenant from
    // leaving a live client behind that can still mint tokens in its name.
    referenceId: text("reference_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("oauth_client_referenceId_idx").on(table.referenceId),
    index("oauth_client_userId_idx").on(table.userId),
  ]
)

export const oauthResource = pgTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims").$type<Record<string, unknown>>(),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required"),
  disabled: boolean("disabled"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  policyVersion: integer("policy_version"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
})

export const oauthClientResource = pgTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("oauth_client_resource_clientId_idx").on(table.clientId),
    index("oauth_client_resource_resourceId_idx").on(table.resourceId),
  ]
)

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at"),
    revoked: timestamp("revoked"),
    rotatedAt: timestamp("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at"),
    authTime: timestamp("auth_time"),
    confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("oauth_refresh_token_clientId_idx").on(table.clientId),
    index("oauth_refresh_token_userId_idx").on(table.userId),
    index("oauth_refresh_token_sessionId_idx").on(table.sessionId),
  ]
)

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at"),
    revoked: timestamp("revoked"),
    confirmation: jsonb("confirmation").$type<Record<string, unknown>>(),
    scopes: text("scopes").array().notNull(),
  },
  (table) => [
    index("oauth_access_token_clientId_idx").on(table.clientId),
    index("oauth_access_token_userId_idx").on(table.userId),
    index("oauth_access_token_sessionId_idx").on(table.sessionId),
  ]
)

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("oauth_consent_clientId_idx").on(table.clientId),
    index("oauth_consent_userId_idx").on(table.userId),
  ]
)

// One row per consumed private_key_jwt assertion id, so a replay collides on
// the primary key instead of being accepted.
export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
})

// A role is the organization's own vocabulary, not the protocol's. It may be
// attached to several applications, so one name can mean the same thing across
// a suite of them.
export const applicationRole = pgTable(
  "application_role",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // What lands in the token. Immutable once issued, unlike `name`.
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("application_role_organizationId_idx").on(table.organizationId),
    uniqueIndex("application_role_organizationId_key_uidx").on(
      table.organizationId,
      table.key
    ),
    // Lets a group grant a role only within the organization both belong to.
    unique("application_role_id_organizationId_unique").on(
      table.id,
      table.organizationId
    ),
  ]
)

export const applicationRoleClient = pgTable(
  "application_role_client",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => applicationRole.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.clientId] }),
    index("application_role_client_clientId_idx").on(table.clientId),
  ]
)

// Keyed on the membership, not the user: leaving the organization drops every
// role by cascade, so a departed member cannot keep one in a token.
export const applicationRoleMember = pgTable(
  "application_role_member",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => applicationRole.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.memberId] }),
    index("application_role_member_memberId_idx").on(table.memberId),
  ]
)

// A set of members named once and granted roles together. Like a role it is
// the organization's own vocabulary, and its key is what lands in a token.
export const group = pgTable(
  "group",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Immutable once issued, unlike `name`.
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("group_organizationId_idx").on(table.organizationId),
    uniqueIndex("group_organizationId_key_uidx").on(
      table.organizationId,
      table.key
    ),
    unique("group_id_organizationId_unique").on(table.id, table.organizationId),
  ]
)

// Keyed on the membership, so leaving the organization leaves every group. The
// organization is stored so both composite keys can insist it is the same one.
export const groupMember = pgTable(
  "group_member",
  {
    groupId: text("group_id").notNull(),
    memberId: text("member_id").notNull(),
    organizationId: text("organization_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.memberId] }),
    index("group_member_memberId_idx").on(table.memberId),
    // Per-organization counts of effective role grants.
    index("group_member_organizationId_idx").on(table.organizationId),
    foreignKey({
      name: "group_member_group_fk",
      columns: [table.groupId, table.organizationId],
      foreignColumns: [group.id, group.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "group_member_member_fk",
      columns: [table.memberId, table.organizationId],
      foreignColumns: [member.id, member.organizationId],
    }).onDelete("cascade"),
  ]
)

// A role a group grants to everyone in it, within one organization.
export const applicationRoleGroup = pgTable(
  "application_role_group",
  {
    roleId: text("role_id").notNull(),
    groupId: text("group_id").notNull(),
    organizationId: text("organization_id").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.groupId] }),
    index("application_role_group_groupId_idx").on(table.groupId),
    foreignKey({
      name: "application_role_group_role_fk",
      columns: [table.roleId, table.organizationId],
      foreignColumns: [applicationRole.id, applicationRole.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "application_role_group_group_fk",
      columns: [table.groupId, table.organizationId],
      foreignColumns: [group.id, group.organizationId],
    }).onDelete("cascade"),
  ]
)

export const systemTaskOutcome = pgEnum("system_task_outcome", [
  "success",
  "failure",
])

// The last run of each housekeeping task, one row per task, so the Health page
// can tell a scheduler that stopped from one that never started. `lastError`
// is a short summary, never a stack or a connection string.
export const systemTaskRun = pgTable("system_task_run", {
  task: text("task").primaryKey(),
  lastStartedAt: timestamp("last_started_at").notNull(),
  // Null while the first run is still going.
  lastFinishedAt: timestamp("last_finished_at"),
  lastOutcome: systemTaskOutcome("last_outcome"),
  lastError: text("last_error"),
  details: jsonb("details").$type<Record<string, unknown>>(),
})

// Daily counters rolled up by housekeeping. A null organization is the whole
// instance, not a missing value, so the instance total survives the purge of
// any tenant that contributed to it. `subjectId` breaks a metric down further,
// such as tokens per OAuth client id; null is the metric's own total.
export const usageDaily = pgTable(
  "usage_daily",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    day: date("day", { mode: "string" }).notNull(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    metric: text("metric").notNull(),
    subjectId: text("subject_id"),
    value: bigint("value", { mode: "number" }).notNull(),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("usage_daily_key_uidx").on(
      table.day,
      sql`coalesce(${table.organizationId}, '')`,
      table.metric,
      sql`coalesce(${table.subjectId}, '')`
    ),
    index("usage_daily_organizationId_metric_day_idx").on(
      table.organizationId,
      table.metric,
      table.day
    ),
    check("usage_daily_value_check", sql`${table.value} >= 0`),
  ]
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}))

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}))

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}))

export const auditEventRelations = relations(auditEvent, ({ one }) => ({
  actor: one(user, {
    fields: [auditEvent.actorUserId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [auditEvent.organizationId],
    references: [organization.id],
    relationName: "auditEventOrganization",
  }),
  actorOrganization: one(organization, {
    fields: [auditEvent.actorOrganizationId],
    references: [organization.id],
    relationName: "auditEventActorOrganization",
  }),
}))
