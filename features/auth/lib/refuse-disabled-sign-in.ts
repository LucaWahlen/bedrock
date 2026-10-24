import { getTranslations } from "next-intl/server"

import {
  recordAuditEvent,
  type AuditActor,
  type AuditEventInput,
} from "@/features/audit"
import {
  recordSignIn,
  type SignInMethod,
} from "@/features/shared/lib/telemetry/metrics"

// What every sign-in action does once the session hook has refused a disabled
// account: a denial rather than a failed attempt, since the credential was
// right.
export async function refuseDisabledSignIn({
  actor,
  organization,
  method,
  metadata,
}: {
  actor: AuditActor
  organization?: AuditEventInput["organization"]
  method: SignInMethod
  metadata?: Record<string, unknown>
}) {
  recordSignIn("denied", method)
  await recordAuditEvent({
    action: "authentication.login",
    outcome: "denied",
    actor,
    organization,
    reason: "Account is disabled",
    metadata,
  })

  const t = await getTranslations("auth.errors")

  return { success: false as const, error: t("accountDisabled") }
}
