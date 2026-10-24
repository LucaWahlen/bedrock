import { z } from "zod"

const BUNDLED_LOGO = "/bedrock-logo.svg"

const BUNDLED_BACKGROUND = "/bedrock-background.webp"

// Shipped in `public/` and uploaded to an organization's own branding prefix.
const SHIPPED_BRANDING = [
  { field: "logo", file: "bedrock-logo.svg", contentType: "image/svg+xml" },
  {
    field: "backgroundImage",
    file: "bedrock-background.webp",
    contentType: "image/webp",
  },
]

const ROOT_ORGANIZATION = { name: "Bedrock", slug: "bedrock", color: "#3e86ff" }

const DEVELOPMENT_AUTH_SECRET = "development-only-secret-change-in-production"

const environmentSchema = z.object({
  database: z.object({
    url: z.string().min(1),
    // Apply the migrations in `drizzle/` before serving, one replica at a
    // time. Off for deployments that run `bedrock migrate` themselves.
    migrateOnStart: z.boolean(),
  }),
  auth: z.object({
    secret: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    url: z.url(),
  }),
  defaultBackgroundImageUrl: z.string().regex(/^\/\S+$/),
  defaultFaviconUrl: z.string().regex(/^\/\S+$/),
  initialAdmin: z.object({
    email: z.email(),
    password: z.string().min(8),
    name: z.string().min(1),
  }),
  rootOrganization: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  shippedBranding: z.array(
    z.object({
      field: z.enum(["logo", "backgroundImage", "favicon"]),
      file: z.string().min(1),
      contentType: z.string().min(1),
    })
  ),
  storage: z.object({
    region: z.string().min(1),
    bucket: z.string().min(1),
    endpoint: z.url(),
    forcePathStyle: z.boolean(),
    publicUrl: z.url(),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  }),
  email: z.object({
    senderName: z.string().min(1),
    senderAddress: z.email(),
    replyToAddress: z.email().optional(),
    smtp: z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      // Implicit TLS on connect (port 465). STARTTLS on 587 leaves this off.
      secure: z.boolean(),
      user: z.string().min(1).optional(),
      password: z.string().min(1).optional(),
    }),
  }),
  security: z.object({
    // Checks new passwords against Have I Been Pwned's free range API. Turn it
    // off where the deployment has no outbound access, or where a request
    // leaving the instance during sign-up is not acceptable.
    checkPwnedPasswords: z.boolean(),
    // Redirect URIs on localhost, for testing an application against a local
    // instance. Never in production, where a loopback client is not ours.
    allowLoopbackRedirectUris: z.boolean(),
  }),
  housekeeping: z.object({
    // Run every task hourly inside the server process. Off for deployments
    // that schedule `bedrock housekeep` themselves.
    enabled: z.boolean(),
    // Unset keeps the audit log forever, which is the safe default for an
    // identity provider. The floor stops a typo from erasing the history.
    auditRetentionDays: z.number().int().min(30).optional(),
    // How long a deleted organization stays restorable by the instance
    // administrators before it is purged.
    organizationRetentionDays: z.number().int().min(1),
  }),
  telemetry: z.object({
    // Unset leaves OpenTelemetry off entirely. The exporters read the rest of
    // the standard `OTEL_EXPORTER_OTLP_*` variables themselves.
    endpoint: z.url().optional(),
    serviceName: z.string().min(1),
  }),
  build: z.object({
    // The source revision the image was built from, when the build passes one.
    commit: z.string().optional(),
  }),
})

type Environment = z.infer<typeof environmentSchema>

function numberEnvironmentVariable(value: string | undefined) {
  if (value === undefined) return undefined

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Expected a numeric environment variable, received: ${value}`
    )
  }

  return parsed
}

function booleanEnvironmentVariable(
  value: string | undefined,
  fallback?: boolean
) {
  if (value === undefined) return fallback
  if (value === "true") return true
  if (value === "false") return false
  throw new Error(`Expected a boolean environment variable, received: ${value}`)
}

function smtpEnvironment(defaults?: { host: string; port: number }) {
  const host = process.env.SMTP_HOST ?? defaults?.host
  const port =
    numberEnvironmentVariable(process.env.SMTP_PORT) ?? defaults?.port
  return {
    host,
    port,
    secure: booleanEnvironmentVariable(process.env.SMTP_SECURE, port === 465),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
  }
}

// Shown to root administrators on the Health page. Anything but a plain hex
// revision is ignored rather than refusing to start over a label.
function buildEnvironment() {
  const commit = process.env.GIT_COMMIT || process.env.SOURCE_COMMIT
  return {
    commit:
      commit && /^[0-9a-f]{7,40}$/i.test(commit)
        ? commit.slice(0, 12).toLowerCase()
        : undefined,
  }
}

function telemetryEnvironment() {
  return {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    serviceName: process.env.OTEL_SERVICE_NAME || "bedrock",
  }
}

const developmentEnvironment = {
  database: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/bedrock",
    // Development applies migrations with `bun run db:migrate`.
    migrateOnStart: booleanEnvironmentVariable(
      process.env.MIGRATE_ON_START,
      false
    ),
  },
  auth: {
    secret: process.env.BETTER_AUTH_SECRET ?? DEVELOPMENT_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  },
  defaultBackgroundImageUrl: BUNDLED_BACKGROUND,
  defaultFaviconUrl: BUNDLED_LOGO,
  initialAdmin: {
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    name: process.env.SEED_ADMIN_NAME ?? "Admin",
  },
  rootOrganization: ROOT_ORGANIZATION,
  shippedBranding: SHIPPED_BRANDING,
  storage: {
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "bedrock-media",
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:4566",
    forcePathStyle: booleanEnvironmentVariable(
      process.env.S3_FORCE_PATH_STYLE,
      true
    ),
    publicUrl:
      process.env.S3_PUBLIC_URL ?? "http://localhost:4566/bedrock-media",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "test",
  },
  email: {
    // Mailpit from `compose.yaml`; no credentials are required locally.
    senderName: process.env.EMAIL_SENDER_NAME ?? ROOT_ORGANIZATION.name,
    senderAddress: process.env.EMAIL_SENDER_ADDRESS ?? "bedrock@example.com",
    replyToAddress: process.env.EMAIL_REPLY_TO_ADDRESS,
    smtp: smtpEnvironment({ host: "localhost", port: 1025 }),
  },
  security: {
    checkPwnedPasswords: booleanEnvironmentVariable(
      process.env.PWNED_PASSWORD_CHECK,
      true
    ),
    allowLoopbackRedirectUris: true,
  },
  housekeeping: {
    // A development database has nothing old enough to purge; run a pass
    // with `bun run housekeep` when you want one.
    enabled: booleanEnvironmentVariable(
      process.env.HOUSEKEEPING_ENABLED,
      false
    ),
    auditRetentionDays: 90,
    organizationRetentionDays: 30,
  },
  telemetry: telemetryEnvironment(),
  build: buildEnvironment(),
}

const productionEnvironment = {
  database: {
    url: process.env.DATABASE_URL,
    migrateOnStart: booleanEnvironmentVariable(
      process.env.MIGRATE_ON_START,
      true
    ),
  },
  auth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL,
  },
  defaultBackgroundImageUrl: BUNDLED_BACKGROUND,
  defaultFaviconUrl: BUNDLED_LOGO,
  initialAdmin: {
    email: process.env.SEED_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    name: process.env.SEED_ADMIN_NAME,
  },
  rootOrganization: ROOT_ORGANIZATION,
  shippedBranding: SHIPPED_BRANDING,
  storage: {
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: booleanEnvironmentVariable(process.env.S3_FORCE_PATH_STYLE),
    publicUrl: process.env.S3_PUBLIC_URL,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  email: {
    senderName: process.env.EMAIL_SENDER_NAME,
    senderAddress: process.env.EMAIL_SENDER_ADDRESS,
    replyToAddress: process.env.EMAIL_REPLY_TO_ADDRESS,
    smtp: smtpEnvironment(),
  },
  security: {
    checkPwnedPasswords: booleanEnvironmentVariable(
      process.env.PWNED_PASSWORD_CHECK,
      true
    ),
    allowLoopbackRedirectUris: false,
  },
  housekeeping: {
    enabled: booleanEnvironmentVariable(process.env.HOUSEKEEPING_ENABLED, true),
    auditRetentionDays: numberEnvironmentVariable(
      process.env.AUDIT_RETENTION_DAYS
    ),
    organizationRetentionDays:
      numberEnvironmentVariable(process.env.ORGANIZATION_RETENTION_DAYS) ?? 30,
  },
  telemetry: telemetryEnvironment(),
  build: buildEnvironment(),
}

// Placeholders and documentation examples that pass the length check but sign
// every session with a value anyone can read.
const KNOWN_WEAK_SECRET =
  /change[-_ ]?(me|it|this)|change-in-production|development|example|placeholder|your[-_ ]?secret|^(secret|password|test)/i

function isWeakSecret(secret: string) {
  return (
    secret === DEVELOPMENT_AUTH_SECRET ||
    KNOWN_WEAK_SECRET.test(secret) ||
    new Set(secret).size < 8
  )
}

const globalForEnvironment = globalThis as typeof globalThis & {
  bedrockInsecureUrlWarned?: boolean
}

/**
 * Refuses to serve production with a session secret anyone could guess. Skipped
 * while `next build` collects page data, so an image can be built with
 * placeholder values and configured only where it runs.
 */
function assertProductionReady(environment: Environment) {
  if (process.env.NODE_ENV !== "production") return environment
  if (process.env.NEXT_PHASE === "phase-production-build") return environment

  if (isWeakSecret(environment.auth.secret)) {
    throw new Error(
      "BETTER_AUTH_SECRET is a placeholder or development value. Generate one with `openssl rand -base64 32`."
    )
  }

  if (
    !environment.auth.url.startsWith("https://") &&
    !globalForEnvironment.bedrockInsecureUrlWarned
  ) {
    globalForEnvironment.bedrockInsecureUrlWarned = true
    console.warn(
      `[env] BETTER_AUTH_URL is not https (${environment.auth.url}). Session cookies lose the Secure flag and HSTS is not sent.`
    )
  }

  return environment
}

export const env = assertProductionReady(
  environmentSchema.parse(
    process.env.NODE_ENV === "production"
      ? productionEnvironment
      : developmentEnvironment
  )
)
