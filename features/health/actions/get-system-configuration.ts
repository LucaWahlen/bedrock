"use server"

import { getTranslations } from "next-intl/server"
import nextPackage from "next/package.json"

import { requireRootAdministration } from "@/features/auth"
import type {
  ConfigurationNotice,
  SystemConfiguration,
} from "@/features/health/types"
import { isLoopbackHost } from "@/features/health/utils/loopback"
import { env } from "@/features/shared/lib/config/env"
import appPackage from "@/package.json"

/**
 * What about this instance's configuration an operator should know, and which
 * build is running. Every notice names a setting, never its value, so nothing
 * here can leak a secret. Root administrators only.
 */
export async function getSystemConfiguration(): Promise<SystemConfiguration> {
  const t = await getTranslations("health")
  await requireRootAdministration(t("errors.forbidden"))

  const production = process.env.NODE_ENV === "production"
  const notices: ConfigurationNotice[] = []

  if (!env.auth.url.startsWith("https://")) {
    notices.push({
      id: "insecure-url",
      // Expected on a laptop, a real exposure anywhere else.
      severity: production ? "warning" : "info",
      title: t("notices.insecureUrl.title"),
      description: t("notices.insecureUrl.description"),
    })
  }

  if (!env.housekeeping.auditRetentionDays) {
    notices.push({
      id: "audit-retention",
      severity: "warning",
      title: t("notices.auditRetention.title"),
      description: t("notices.auditRetention.description"),
    })
  }

  if (isLoopbackHost(env.email.smtp.host)) {
    notices.push({
      id: "local-email",
      severity: production ? "warning" : "info",
      title: t("notices.localEmail.title"),
      description: t("notices.localEmail.description"),
    })
  }

  if (!env.telemetry.endpoint) {
    notices.push({
      id: "telemetry",
      severity: "info",
      title: t("notices.telemetry.title"),
      description: t("notices.telemetry.description"),
    })
  }

  return {
    // Warnings first, so the list reads in order of what to do.
    notices: notices.toSorted(
      (a, b) => Number(a.severity === "info") - Number(b.severity === "info")
    ),
    build: {
      version: appPackage.version,
      nextVersion: nextPackage.version,
      commit: env.build.commit ?? null,
    },
  }
}
