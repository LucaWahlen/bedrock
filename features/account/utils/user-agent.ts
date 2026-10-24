import type { DeviceDescription, DeviceType } from "@/features/account/types"
import type { Translator } from "@/features/shared/lib/i18n/translator"

// Deliberately small: enough to tell someone which of their own devices a
// session is, not a fingerprinting library. Order matters, because nearly every
// browser claims to be several of the others in its user agent.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bVivaldi\//, "Vivaldi"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  [/\bcurl\//, "curl"],
]

const OPERATING_SYSTEMS: [RegExp, string][] = [
  [/\biPad\b/, "iPadOS"],
  [/\b(?:iPhone|iPod)\b/, "iOS"],
  [/\bWindows\b/, "Windows"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
]

function firstMatch(userAgent: string, patterns: [RegExp, string][]) {
  return patterns.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

function deviceType(userAgent: string, os: string | null): DeviceType {
  if (os === "iPadOS" || /\bTablet\b/i.test(userAgent)) return "tablet"
  // Android phones say "Mobile"; an Android tablet does not.
  if (os === "Android")
    return /\bMobile\b/.test(userAgent) ? "mobile" : "tablet"
  if (os === "iOS" || /\bMobi/.test(userAgent)) return "mobile"
  if (os) return "desktop"

  return "unknown"
}

export function describeUserAgent(
  userAgent: string | null | undefined
): DeviceDescription {
  const value = userAgent?.trim() ?? ""
  if (!value) {
    return { browser: null, os: null, type: "unknown", label: "Unknown device" }
  }

  const browser = firstMatch(value, BROWSERS)
  const os = firstMatch(value, OPERATING_SYSTEMS)
  const label =
    browser && os
      ? `${browser} on ${os}`
      : (browser ?? (os ? `${os} device` : "Unknown device"))

  return { browser, os, type: deviceType(value, os), label }
}

// The device as its reader names it: "Firefox on macOS", "Firefox unter macOS".
// Browser and system names are proper nouns and stay as recognised.
export function deviceLabel(
  device: Pick<DeviceDescription, "browser" | "os">,
  t: Translator<"account">
) {
  const { browser, os } = device
  if (browser && os) return t("device.browserOnOs", { browser, os })
  if (browser) return browser
  if (os) return t("device.osDevice", { os })

  return t("device.unknown")
}
