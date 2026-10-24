"use server"

import { constantTimeEqual, makeSignature } from "better-auth/crypto"
import { cookies } from "next/headers"

import { auth } from "@/features/auth/lib/auth"

// The two-factor plugin's own cookie name, before Better Auth prefixes it.
const TWO_FACTOR_COOKIE = "two_factor"

/**
 * Who is halfway through signing in on this browser: their password was right,
 * and the two-factor plugin is waiting for their second factor. The cookie is
 * read and its signature checked exactly as the plugin will, so this never
 * names anyone the plugin would not.
 *
 * Holding this cookie is not being signed in: nothing here is a session, and
 * the access context never sees one.
 */
export async function getPendingTwoFactor(): Promise<{
  id: string
  name: string
  email: string
} | null> {
  const context = await auth.$context
  const cookieName = context.createAuthCookie(TWO_FACTOR_COOKIE).name
  const raw = (await cookies()).get(cookieName)?.value
  if (!raw) return null

  const value = decodeURIComponent(raw)
  const separator = value.lastIndexOf(".")
  if (separator < 1) return null

  const identifier = value.slice(0, separator)
  const signature = value.slice(separator + 1)
  const expected = await makeSignature(identifier, context.secret)
  if (!constantTimeEqual(signature, expected)) return null

  const pending =
    await context.internalAdapter.findVerificationValue(identifier)
  if (!pending || pending.expiresAt <= new Date()) return null

  const found = await context.internalAdapter.findUserById(pending.value)
  if (!found) return null

  return { id: found.id, name: found.name, email: found.email }
}
