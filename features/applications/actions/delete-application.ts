"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import { applicationInOrganization } from "@/features/applications/lib/application-ownership"
import {
  applicationIconKey,
  deleteStoredObjects,
} from "@/features/applications/lib/icon-storage"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { oauthClient } from "@/features/shared/lib/db/schema"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

export async function deleteApplication(
  organizationId: string,
  clientId: string
): Promise<ActionResult> {
  const t = await getTranslations("applications")
  const authorization = await authorizeApplicationMutation({
    action: "application.deleted",
    organizationId,
    deniedError: t("errors.deleteDenied"),
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

  // Tokens and consents reference the client and go with it by cascade, so no
  // grant outlives the application it was issued for.
  await db.transaction(async (tx) => {
    await tx.delete(oauthClient).where(eq(oauthClient.clientId, clientId))

    await recordAuditEvent(
      {
        action: "application.deleted",
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
      },
      tx
    )
  })

  const icon = applicationIconKey(
    organization.id,
    clientId,
    application.icon,
    env.storage.publicUrl
  )
  if (icon) await deleteStoredObjects([icon])

  revalidateEverywhere()

  return { success: true }
}
