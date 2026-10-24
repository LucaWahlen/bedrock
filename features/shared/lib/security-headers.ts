import { env } from "@/features/shared/lib/config/env"

export function createNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64")
}

/**
 * Where the browser PUTs a presigned upload: the S3 endpoint itself, or the
 * bucket's virtual host on it when path-style addressing is off. Not the public
 * URL, which on R2 is a different host that only serves reads.
 */
export function storageUploadOrigin(storage: {
  endpoint: string
  bucket: string
  forcePathStyle: boolean
}) {
  const endpoint = new URL(storage.endpoint)
  if (storage.forcePathStyle) return endpoint.origin

  return `${endpoint.protocol}//${storage.bucket}.${endpoint.host}`
}

/**
 * Read from `env` at request time (not baked into the build), so a single
 * container image works across deployments with different storage hosts.
 */
export function securityHeaders(nonce: string): [string, string][] {
  const storageOrigin = new URL(env.storage.publicUrl).origin
  const uploadOrigin = storageUploadOrigin(env.storage)
  const isHttps = env.auth.url.startsWith("https://")

  const headers: [string, string][] = [
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    [
      "Permissions-Policy",
      // Passkeys are created and used by this origin only, never by a frame.
      "camera=(), microphone=(), geolocation=(), publickey-credentials-create=(self), publickey-credentials-get=(self)",
    ],
  ]

  // Dev/Turbopack's hot-reload and React's dev-mode debugging both rely on
  // eval() and unnonced inline scripts a real CSP has to forbid, so only a
  // production server enforces one.
  if (process.env.NODE_ENV === "production") {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      // 'strict-dynamic' trusts scripts loaded by the nonce'd script (Next's
      // own chunks), so framework-injected scripts work without a broad
      // allowlist.
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      // Base UI sets some styles inline; there is no nonce for style attributes.
      "style-src 'self' 'unsafe-inline'",
      // `blob:` is a picked file previewed, or read for its colour, before it
      // is uploaded. The TOTP QR code is inline SVG and needs nothing.
      `img-src 'self' data: blob: ${storageOrigin}`,
      "font-src 'self' data:",
      // Media is PUT straight to storage with a presigned URL. Telemetry is
      // exported by the server, so nothing else is reached from the browser.
      `connect-src 'self' ${uploadOrigin}`,
    ].join("; ")

    headers.push(["Content-Security-Policy", contentSecurityPolicy])
  }

  // Only when the deployment's own URL is https, or HSTS would lock out an
  // instance deliberately served over plain HTTP (e.g. behind a LAN-only proxy).
  if (isHttps) {
    headers.push([
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains",
    ])
  }

  return headers
}
