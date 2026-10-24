import { createHash, webcrypto } from "node:crypto"

import { env } from "@/features/shared/lib/config/env"

// A software WebAuthn authenticator: just enough of a platform authenticator to
// answer the passkey plugin's registration and sign-in ceremonies with real
// signatures, so the server-side verification under test is the real one.

const relyingParty = new URL(env.auth.url)

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url")
}

function sha256(bytes: Uint8Array | string) {
  return new Uint8Array(createHash("sha256").update(bytes).digest())
}

function concat(...parts: Uint8Array[]) {
  return new Uint8Array(Buffer.concat(parts))
}

// The CBOR subset WebAuthn needs: unsigned and negative integers, byte and
// text strings, and maps.
type CborValue = number | string | Uint8Array | Map<CborValue, CborValue>

function cborHead(major: number, length: number) {
  if (length < 24) return Uint8Array.of((major << 5) | length)
  if (length < 0x100) return Uint8Array.of((major << 5) | 24, length)
  if (length < 0x10000) {
    return Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff)
  }
  throw new Error("CBOR value too long for this encoder")
}

function cbor(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value)
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value)
    return concat(cborHead(3, bytes.length), bytes)
  }
  if (value instanceof Uint8Array) {
    return concat(cborHead(2, value.length), value)
  }
  const entries = [...value].flatMap(([key, entry]) => [cbor(key), cbor(entry)])
  return concat(cborHead(5, value.size), ...entries)
}

// WebCrypto signs ECDSA as raw r||s; WebAuthn carries it DER-encoded.
function derSignature(raw: Uint8Array) {
  const integer = (bytes: Uint8Array) => {
    let start = 0
    while (start < bytes.length - 1 && bytes[start] === 0) start++
    let trimmed = bytes.slice(start)
    if (trimmed[0] & 0x80) trimmed = concat(Uint8Array.of(0), trimmed)
    return concat(Uint8Array.of(0x02, trimmed.length), trimmed)
  }
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)))

  return concat(Uint8Array.of(0x30, body.length), body)
}

function clientData(type: string, challenge: string, origin: string) {
  return new TextEncoder().encode(
    JSON.stringify({ type, challenge, origin, crossOrigin: false })
  )
}

// User present and verified, as a platform authenticator reports after a
// fingerprint or PIN.
const FLAGS = { userPresent: 0x01, userVerified: 0x04, attested: 0x40 }

export type SoftwarePasskey = Awaited<ReturnType<typeof createSoftwarePasskey>>

export async function createSoftwarePasskey() {
  const keys = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )
  const credentialId = webcrypto.getRandomValues(new Uint8Array(32))
  const jwk = await webcrypto.subtle.exportKey("jwk", keys.publicKey)
  const rpIdHash = sha256(relyingParty.hostname)
  let signCount = 0

  const counter = () => {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, signCount)
    return bytes
  }

  return {
    id: base64url(credentialId),

    // The response to `navigator.credentials.create()`, as JSON.
    register(
      options: { challenge: string },
      origin: string = relyingParty.origin
    ) {
      const publicKey = cbor(
        new Map<CborValue, CborValue>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, new Uint8Array(Buffer.from(jwk.x ?? "", "base64url"))],
          [-3, new Uint8Array(Buffer.from(jwk.y ?? "", "base64url"))],
        ])
      )
      const length = new Uint8Array(2)
      new DataView(length.buffer).setUint16(0, credentialId.length)
      const authenticatorData = concat(
        rpIdHash,
        Uint8Array.of(FLAGS.userPresent | FLAGS.userVerified | FLAGS.attested),
        counter(),
        new Uint8Array(16),
        length,
        credentialId,
        publicKey
      )
      const attestationObject = cbor(
        new Map<CborValue, CborValue>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authenticatorData],
        ])
      )

      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: "public-key" as const,
        response: {
          clientDataJSON: base64url(
            clientData("webauthn.create", options.challenge, origin)
          ),
          attestationObject: base64url(attestationObject),
          transports: ["internal"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform" as const,
      }
    },

    // The response to `navigator.credentials.get()`, as JSON.
    async authenticate(
      options: { challenge: string },
      origin: string = relyingParty.origin
    ) {
      signCount += 1
      const authenticatorData = concat(
        rpIdHash,
        Uint8Array.of(FLAGS.userPresent | FLAGS.userVerified),
        counter()
      )
      const clientDataJSON = clientData(
        "webauthn.get",
        options.challenge,
        origin
      )
      const signature = new Uint8Array(
        await webcrypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          concat(authenticatorData, sha256(clientDataJSON))
        )
      )

      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: "public-key" as const,
        response: {
          clientDataJSON: base64url(clientDataJSON),
          authenticatorData: base64url(authenticatorData),
          signature: base64url(derSignature(signature)),
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform" as const,
      }
    },
  }
}
