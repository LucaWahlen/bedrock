"use server"

import { desc } from "drizzle-orm"
import { getFormatter, getTranslations } from "next-intl/server"
import { z } from "zod"

import { requireRootAdministration } from "@/features/auth"
import {
  HEALTH_CHECKS,
  type HealthCheckKind,
  type HealthCheckResult,
} from "@/features/health/types"
import { isLoopbackHost } from "@/features/health/utils/loopback"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { jwks } from "@/features/shared/lib/db/schema"
import {
  checkDatabase,
  checkEmail,
  checkStorage,
  getMigrationStatus,
  runProbe,
} from "@/features/shared/lib/health"

const DAY = 24 * 60 * 60 * 1000

// Past this a signing key has outlived most rotation policies.
const KEY_AGE_WARNING_DAYS = 365

type Translate = Awaited<ReturnType<typeof getTranslations<"health.checks">>>
type Format = Awaited<ReturnType<typeof getFormatter>>

async function database(t: Translate): Promise<HealthCheckResult> {
  const reachable = await checkDatabase()
  if (!reachable.ok) {
    return {
      status: "error",
      detail: reachable.detail ?? t("database.unreachable"),
      latencyMs: reachable.latencyMs,
    }
  }

  const migrations = await runProbe(() => getMigrationStatus())
  if (migrations.failed) {
    return {
      status: "error",
      detail: t("database.migrationsUnreadable", {
        detail: migrations.detail,
      }),
      latencyMs: reachable.latencyMs,
    }
  }

  const { applied, expected, pending } = migrations.result
  if (pending.length > 0) {
    return {
      status: "error",
      detail: t("database.pending", {
        applied,
        expected,
        pending: pending.join(", "),
      }),
      latencyMs: reachable.latencyMs,
    }
  }

  return {
    // More applied than shipped: the database is ahead of this build, as
    // after rolling back an image.
    status: applied > expected ? "warning" : "ok",
    detail:
      applied > expected
        ? t("database.ahead", { applied, expected })
        : t("database.applied", { applied, expected }),
    latencyMs: reachable.latencyMs,
  }
}

async function storage(t: Translate): Promise<HealthCheckResult> {
  const check = await checkStorage()

  return {
    status: check.ok ? "ok" : "error",
    detail: check.ok
      ? t("storage.reachable", { bucket: env.storage.bucket })
      : (check.detail ?? t("database.unreachable")),
    latencyMs: check.latencyMs,
  }
}

async function email(t: Translate): Promise<HealthCheckResult> {
  const check = await checkEmail()
  const { host, port } = env.email.smtp
  if (!check.ok) {
    return {
      status: "error",
      detail: check.detail ?? t("database.unreachable"),
      latencyMs: check.latencyMs,
    }
  }

  // A local sink accepts everything and delivers nothing, which is the point
  // in development and an outage in production.
  if (isLoopbackHost(host)) {
    return {
      status: process.env.NODE_ENV === "production" ? "warning" : "ok",
      detail: t("email.localSink", { host, port: String(port) }),
      latencyMs: check.latencyMs,
    }
  }

  return {
    status: "ok",
    detail: t("email.accepting", { host, port: String(port) }),
    latencyMs: check.latencyMs,
  }
}

async function signingKeys(
  t: Translate,
  format: Format
): Promise<HealthCheckResult> {
  // Never the key material: only what describes a key.
  const outcome = await runProbe(() =>
    db
      .select({
        createdAt: jwks.createdAt,
        expiresAt: jwks.expiresAt,
        alg: jwks.alg,
      })
      .from(jwks)
      .orderBy(desc(jwks.createdAt))
  )
  if (outcome.failed) {
    return {
      status: "error",
      detail: outcome.detail,
      latencyMs: outcome.latencyMs,
    }
  }

  const now = Date.now()
  const keys = outcome.result
  const usable = keys.filter(
    (key) => !key.expiresAt || key.expiresAt.getTime() > now
  )
  const [newest] = usable
  const latencyMs = outcome.latencyMs

  if (keys.length === 0) {
    return {
      status: "ok",
      detail: t("signingKeys.none"),
      latencyMs,
    }
  }
  if (!newest) {
    return {
      status: "error",
      detail: t("signingKeys.allExpired", { count: keys.length }),
      latencyMs,
    }
  }

  const ageDays = Math.floor((now - newest.createdAt.getTime()) / DAY)
  const summary = t("signingKeys.summary", {
    algorithm: newest.alg ?? t("signingKeys.unknownAlgorithm"),
    created: format.relativeTime(newest.createdAt, now),
    count: usable.length,
  })

  return ageDays > KEY_AGE_WARNING_DAYS
    ? {
        status: "warning",
        detail: t("signingKeys.old", { summary }),
        latencyMs,
      }
    : { status: "ok", detail: summary, latencyMs }
}

const CHECKS: Record<
  HealthCheckKind,
  (t: Translate, format: Format) => Promise<HealthCheckResult>
> = {
  database,
  storage,
  email,
  signingKeys,
}

/**
 * One row of the Health page. Results name hosts, buckets and migrations, so
 * they answer only to a root administrator, rechecked on every call.
 */
export async function runHealthCheck(
  kind: HealthCheckKind
): Promise<HealthCheckResult> {
  const check = z.enum(HEALTH_CHECKS).parse(kind)
  const [t, format] = await Promise.all([
    getTranslations("health"),
    getFormatter(),
  ])
  await requireRootAdministration(t("errors.forbidden"))

  return CHECKS[check](await getTranslations("health.checks"), format)
}
