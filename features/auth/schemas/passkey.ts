import { z } from "zod"

const base64url = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[A-Za-z0-9_-]*$/, "Not a base64url value")

// What `@simplewebauthn/browser` hands back from `startAuthentication`. Only the
// shape is checked here; the signature, challenge, origin and relying party are
// verified by the passkey plugin.
export const passkeyAuthenticationResponseSchema = z.object({
  id: base64url(1024).min(1),
  rawId: base64url(1024).min(1),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64url(8192),
    authenticatorData: base64url(8192),
    signature: base64url(4096),
    userHandle: base64url(1024).optional(),
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
})
