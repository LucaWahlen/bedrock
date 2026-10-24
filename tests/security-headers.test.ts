import { afterEach, describe, expect, test } from "bun:test"

import { env } from "@/features/shared/lib/config/env"
import {
  securityHeaders,
  storageUploadOrigin,
} from "@/features/shared/lib/security-headers"

// What the browser is allowed to do, checked against what the app ships:
// passkeys, previews of a picked file, presigned uploads straight to storage.

const originalNodeEnv = process.env.NODE_ENV

function setNodeEnv(value: string | undefined) {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

afterEach(() => setNodeEnv(originalNodeEnv))

function header(name: string) {
  return new Map(securityHeaders("nonce-value")).get(name)
}

function directive(policy: string | undefined, name: string) {
  return policy
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name} `))
}

describe("the upload origin", () => {
  test("is the endpoint for path-style addressing", () => {
    expect(
      storageUploadOrigin({
        endpoint: "https://account.r2.cloudflarestorage.com",
        bucket: "media",
        forcePathStyle: true,
      })
    ).toBe("https://account.r2.cloudflarestorage.com")
  })

  test("is the bucket's virtual host otherwise", () => {
    expect(
      storageUploadOrigin({
        endpoint: "https://s3.eu-central-1.amazonaws.com/",
        bucket: "media",
        forcePathStyle: false,
      })
    ).toBe("https://media.s3.eu-central-1.amazonaws.com")
  })
})

describe("the headers", () => {
  test("leave passkeys to this origin and deny the rest", () => {
    const policy = header("Permissions-Policy")

    expect(policy).toContain("publickey-credentials-get=(self)")
    expect(policy).toContain("publickey-credentials-create=(self)")
    expect(policy).toContain("camera=()")
  })

  test("enforce no policy in development", () => {
    setNodeEnv("development")

    expect(header("Content-Security-Policy")).toBeUndefined()
  })

  test("let a production browser upload and preview media, and nothing more", () => {
    setNodeEnv("production")
    const policy = header("Content-Security-Policy")

    expect(directive(policy, "connect-src")).toBe(
      `connect-src 'self' ${storageUploadOrigin(env.storage)}`
    )
    expect(directive(policy, "img-src")).toBe(
      `img-src 'self' data: blob: ${new URL(env.storage.publicUrl).origin}`
    )
    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' 'nonce-nonce-value' 'strict-dynamic'"
    )
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(directive(policy, "object-src")).toBe("object-src 'none'")
  })
})
