"use server"

import { eq } from "drizzle-orm"
import { getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import { authorizeApplicationMutation } from "@/features/applications/lib/application-mutation"
import {
  deleteStoredObjects,
  promoteApplicationIcon,
} from "@/features/applications/lib/icon-storage"
import {
  createApplicationSchema,
  endSessionSettings,
  isLoopbackRedirectUri,
  oauthApplicationType,
  registeredClientAuthMethod,
} from "@/features/applications/schemas/application"
import type {
  ApplicationSecretResult,
  CreateApplicationInput,
} from "@/features/applications/types"
import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { auth } from "@/features/auth"
import { env } from "@/features/shared/lib/config/env"
import { db } from "@/features/shared/lib/db/client"
import { oauthClient } from "@/features/shared/lib/db/schema"
import { withOAuthClientOwner } from "@/features/shared/lib/oauth-client-owner"
import { revalidateEverywhere } from "@/features/shared/lib/revalidate"

export async function createApplication(
  input: CreateApplicationInput
): Promise<ApplicationSecretResult> {
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
    action: "application.created",
    organizationId: input.organizationId,
    deniedError: t("errors.createDenied"),
    target: () => ({ type: "application", id: "new", label: parsed.data.name }),
  })

  if (!authorization.authorized) {
    return { success: false, error: authorization.error }
  }

  const { currentUser, organization } = authorization
  const tokenEndpointAuthMethod = registeredClientAuthMethod(
    parsed.data.isPublic,
    parsed.data.tokenEndpointAuthMethod
  )
  let createdClientId: string | undefined
  let promotedIconKey: string | undefined

  try {
    // The plugin takes the owning organization from the request rather than
    // from the session, so the client cannot be attributed to whichever
    // organization another tab happened to load last.
    const client = await withOAuthClientOwner(organization.id, async () =>
      auth.api.adminCreateOAuthClient({
        headers: await headers(),
        body: {
          client_name: parsed.data.name,
          redirect_uris: parsed.data.redirectUris,
          application_type: oauthApplicationType(parsed.data.redirectUris),
          client_uri: parsed.data.uri ?? undefined,
          token_endpoint_auth_method: parsed.data.isPublic
            ? "none"
            : tokenEndpointAuthMethod,
          grant_types: ["authorization_code"],
          response_types: ["code"],
          skip_consent: parsed.data.skipConsent ?? false,
          client_secret_expires_at: 0,
        },
      })
    )
    createdClientId = client.client_id

    // The claim callbacks are handed the client's own metadata and little
    // else — not its id — so the id is stamped here to make per-application
    // role resolution possible at token time.
    const icon = input.icon?.key
      ? await promoteApplicationIcon(
          organization.id,
          client.client_id,
          input.icon.key,
          currentUser.id
        )
      : null
    promotedIconKey = icon?.key

    await db
      .update(oauthClient)
      .set({
        ...(icon && { icon: icon.publicUrl }),
        ...endSessionSettings(parsed.data.postLogoutRedirectUris),
        metadata: {
          clientId: client.client_id,
          organizationId: organization.id,
        },
      })
      .where(eq(oauthClient.clientId, client.client_id))

    await recordAuditEvent({
      action: "application.created",
      actor: auditActorFromUser(currentUser, organization.id),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      target: {
        type: "application",
        id: client.client_id,
        label: parsed.data.name,
      },
      metadata: {
        redirectUris: parsed.data.redirectUris,
        postLogoutRedirectUris: parsed.data.postLogoutRedirectUris ?? [],
        launchUrl: parsed.data.uri ?? null,
        confidential: !parsed.data.isPublic,
        tokenEndpointAuthMethod: parsed.data.isPublic
          ? null
          : (parsed.data.tokenEndpointAuthMethod ?? "client_secret_basic"),
      },
    })

    revalidateEverywhere()

    return {
      success: true,
      clientId: client.client_id,
      // Shown once. Only a hash is kept, so it cannot be recovered later.
      clientSecret: client.client_secret ?? null,
      tokenEndpointAuthMethod,
    }
  } catch (error) {
    // A half-made client has no owner metadata, so it could never sign anyone in.
    if (createdClientId) {
      await db
        .delete(oauthClient)
        .where(eq(oauthClient.clientId, createdClientId))
        .catch(() => undefined)
    }
    if (promotedIconKey) await deleteStoredObjects([promotedIconKey])

    await recordAuditEvent({
      action: "application.created",
      outcome: "failure",
      actor: auditActorFromUser(currentUser, organization.id),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      target: { type: "application", id: "new", label: parsed.data.name },
      reason:
        error instanceof Error ? error.message : "Could not create application",
    }).catch(() => undefined)

    return { success: false, error: t("errors.createFailed") }
  }
}
