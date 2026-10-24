"use server"

import { headers } from "next/headers"

import { auditActorFromUser, recordAuditEvent } from "@/features/audit"
import { getAccessContext } from "@/features/auth/actions/get-access-context"
import { auth } from "@/features/auth/lib/auth"
import { membershipIn } from "@/features/auth/utils/access"
import { getOrganizationBySlug } from "@/features/organizations"

export async function logout(organizationSlug?: string) {
  const access = await getAccessContext()

  await auth.api.signOut({ headers: await headers() })

  if (!access.user) return

  const target = organizationSlug
    ? await getOrganizationBySlug(organizationSlug)
    : undefined
  // Signing out from an organization's page does not make the event theirs, and
  // without membership no organization has an interest in recording it.
  if (!target || !membershipIn(access, target.id)) return

  await recordAuditEvent({
    action: "authentication.logout",
    actor: auditActorFromUser(access.user),
    organization: { id: target.id, name: target.name, slug: target.slug },
  })
}
