"use server"

import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import { applicationInOrganization } from "@/features/applications/lib/application-ownership"
import type { ApplicationSecretResult } from "@/features/applications/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth"
import { withOAuthClientOwner } from "@/features/shared/lib/oauth-client-owner"

// The previous secret stops working immediately, so this is a deliberate,
// audited act rather than a convenience.
export async function rotateApplicationSecret(
  organizationId: string,
  clientId: string
): Promise<ApplicationSecretResult> {
  const t = await getTranslations("applications")
  const authorization = await authorizeApplicationMutation({
    action: "application.secret_rotated",
    organizationId,
    deniedError: t("errors.rotateDenied"),
    target: () => ({ type: "application", id: clientId }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization
  const application = await applicationInOrganization(clientId, organization.id)

  if (!application) {
    return { success: false, error: t("errors.applicationNotFound") }
  }

  try {
    const rotated = await withOAuthClientOwner(organization.id, async () =>
      auth.api.rotateClientSecret({
        headers: await headers(),
        body: { client_id: clientId },
      })
    )

    await recordAuditEvent({
      action: "application.secret_rotated",
      actor: auditActorFromUser(currentUser, organization.id),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      target: {
        type: "application",
        id: clientId,
        label: application.name,
      },
    })

    return {
      success: true,
      clientId,
      clientSecret: rotated.client_secret ?? null,
    }
  } catch (error) {
    await recordAuditEvent({
      action: "application.secret_rotated",
      outcome: "failure",
      actor: auditActorFromUser(currentUser, organization.id),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      target: {
        type: "application",
        id: clientId,
        label: application.name,
      },
      reason:
        error instanceof Error ? error.message : "Could not rotate secret",
    }).catch(() => undefined)

    return { success: false, error: t("errors.rotateFailed") }
  }
}
