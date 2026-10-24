import { describeUserAgent } from "@/features/account"

/**
 * What makes two sign-ins "the same device" without fingerprinting anyone: the
 * same browser on the same operating system. A user agent naming neither is
 * compared whole, and an absent one matches nothing.
 */
export function deviceFamily(userAgent: string | null | undefined) {
  const value = userAgent?.trim()
  if (!value) return null

  const { browser, os } = describeUserAgent(value)

  return browser || os ? `${browser ?? "?"}|${os ?? "?"}` : `raw:${value}`
}
