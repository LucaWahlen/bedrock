import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { StatusPage } from "@/features/app"
import {
  canAccessOrganization,
  getAccessContext,
  membershipIn,
} from "@/features/auth"
import {
  getOrganizationBySlug,
  getRootOrganization,
} from "@/features/organizations"

type SuspendedPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: SuspendedPageProps): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)
  const rootOrganization = currentOrganization
    ? undefined
    : await getRootOrganization()
  const organizationName = currentOrganization?.name ?? rootOrganization?.name

  return {
    title: organizationName ? `403 | ${organizationName}` : "403",
  }
}

export default async function Page({ params }: SuspendedPageProps) {
  const { slug } = await params
  const currentOrganization = await getOrganizationBySlug(slug)

  if (!currentOrganization) {
    notFound()
  }

  const access = await getAccessContext()
  if (!access.user) redirect(`/org/${slug}/logout`)

  const membership = membershipIn(access, currentOrganization.id)
  if (!membership) redirect(`/org/${slug}/forbidden`)

  // Reachable only while the organization is closed to this member.
  if (canAccessOrganization(membership)) {
    redirect(`/org/${slug}`)
  }

  const t = await getTranslations("app.status")
  const organization = currentOrganization.name
  const signOut = {
    href: `/org/${slug}/logout`,
    label: t("switchAccount"),
  }
  const elsewhere = access.memberships.some(canAccessOrganization)

  return (
    <StatusPage
      organization={currentOrganization}
      code="403"
      title={t("suspended.title")}
      description={t("suspended.description", { organization })}
      action={
        elsewhere ? { href: "/", label: t("availableOrganizations") } : signOut
      }
      secondaryAction={elsewhere ? signOut : undefined}
    />
  )
}
