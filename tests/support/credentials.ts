import { auth } from "@/features/auth/lib/auth"

// A password for a fixture user, stored exactly as sign-up stores one, so the
// real sign-in action can be driven against them.
export async function givePassword(userId: string, password: string) {
  const context = await auth.$context
  await context.internalAdapter.linkAccount({
    userId,
    providerId: "credential",
    accountId: userId,
    issuer: "local:credential",
    password: await context.password.hash(password),
  })
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

// What an authenticator app is given is the base32 form of the secret the
// plugin generates, so it is decoded back before the plugin computes a code.
function fromBase32(encoded: string) {
  let bits = ""
  for (const character of encoded.replace(/=+$/, "").toUpperCase()) {
    const value = BASE32.indexOf(character)
    if (value < 0) throw new Error(`Not base32: ${character}`)
    bits += value.toString(2).padStart(5, "0")
  }
  const bytes = bits.match(/.{8}/g) ?? []

  return Buffer.from(bytes.map((byte) => parseInt(byte, 2))).toString()
}

// The current code for the secret an authenticator app was shown, computed by
// the plugin's own generator.
export async function totpFor(appSecret: string) {
  const { code } = await auth.api.generateTOTP({
    body: { secret: fromBase32(appSecret) },
  })

  return code
}
