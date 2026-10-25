"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import { applicationInOrganization } from "@/features/applications/lib/application-ownership"
import {
  applicationIconKey,
  deleteStoredObjects,
  promoteApplicationIcon,
} from "@/features/applications/lib/icon-storage"
import {
  createApplicationSchema,
  endSessionSettings,
  isLoopbackRedirectUri,
  oauthApplicationType,
} from "@/features/applications/schemas/application"
import type { UpdateApplicationInput } from "@/features/applications/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { oauthClient } from "@/features/shared/lib/db/schema"
import { withOAuthClientOwner } from "@/features/shared/lib/oauth-client-owner"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"
import type { ActionResult } from "@/features/shared/types"

export async function updateApplication(
  input: UpdateApplicationInput
): Promise<ActionResult> {
  const t = await getTranslations("applications")
  const parsed = createApplicationSchema(t).safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidApplication"),
    }
  }
  if (
    !env.security.allowLoopbackRedirectUris &&
    [
      ...parsed.data.redirectUris,
      ...(parsed.data.postLogoutRedirectUris ?? []),
    ].some(isLoopbackRedirectUri)
  ) {
    return { success: false, error: t("errors.httpsRedirectRequired") }
  }

  const authorization = await authorizeApplicationMutation({
    action: "application.updated",
    organizationId: input.organizationId,
    deniedError: t("errors.updateDenied"),
    target: () => ({
      type: "application",
      id: input.clientId,
      label: parsed.data.name,
    }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization
  const application = await applicationInOrganization(
    input.clientId,
    organization.id
  )

  if (!application) {
    return { success: false, error: t("errors.applicationNotFound") }
  }

  let unusedIconKey: string | undefined

  try {
    await withOAuthClientOwner(organization.id, async () =>
      auth.api.adminUpdateOAuthClient({
        headers: await headers(),
        body: {
          client_id: input.clientId,
          update: {
            client_name: parsed.data.name,
            redirect_uris: parsed.data.redirectUris,
            application_type: oauthApplicationType(parsed.data.redirectUris),
            client_uri: parsed.data.uri ?? undefined,
            skip_consent: parsed.data.skipConsent ?? false,
          },
        },
      })
    )

    // The plugin owns the row, so the metadata the claim callbacks depend on is
    // re-stamped rather than assumed to have survived the update.
    const icon =
      input.icon === undefined
        ? undefined
        : input.icon === null
          ? null
          : await promoteApplicationIcon(
              organization.id,
              input.clientId,
              input.icon.key,
              currentUser.id
            )
    unusedIconKey = icon?.key

    await db
      .update(oauthClient)
      .set({
        ...(icon !== undefined && { icon: icon?.publicUrl ?? null }),
        // The plugin reads an absent `client_uri` as "unchanged", so clearing
        // the launch URL has to be written here.
        uri: parsed.data.uri ?? null,
        // Written here for the same reason: an empty list would otherwise
        // leave the old one in place.
        ...endSessionSettings(parsed.data.postLogoutRedirectUris),
        metadata: {
          clientId: input.clientId,
          organizationId: organization.id,
        },
      })
      .where(eq(oauthClient.clientId, input.clientId))
    unusedIconKey = undefined

    // Only after the row points elsewhere, and only for a key that decodes back
    // to this application's own prefix.
    if (icon !== undefined) {
      const replaced = applicationIconKey(
        organization.id,
        input.clientId,
        application.icon,
        env.storage.publicUrl
      )
      if (replaced) await deleteStoredObjects([replaced])
    }

    await recordAuditEvent({
      action: "application.updated",
      actor: auditActorFromUser(currentUser, organization.id),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      target: {
        type: "application",
        id: input.clientId,
        label: parsed.data.name,
      },
      metadata: {
        redirectUris: parsed.data.redirectUris,
        postLogoutRedirectUris: parsed.data.postLogoutRedirectUris ?? [],
        launchUrl: parsed.data.uri ?? null,
      },
    })
  } catch (error) {
    if (unusedIconKey) await deleteStoredObjects([unusedIconKey])

    await recordAuditEvent({
      action: "application.updated",
      outcome: "failure",
      actor: auditActorFromUser(currentUser, organization.id),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      target: {
        type: "application",
        id: input.clientId,
        label: application.name,
      },
      reason:
        error instanceof Error ? error.message : "Could not update application",
    }).catch(() => undefined)

    return { success: false, error: t("errors.updateFailed") }
  }

  revalidateEverywhere()

  return { success: true }
}
