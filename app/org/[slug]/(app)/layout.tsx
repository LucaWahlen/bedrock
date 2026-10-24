import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { notFound, redirect } from "next/navigation"

import { AppSidebar, appCapabilities } from "@/features/app"
import {
  awaitsSecondFactor,
  canAccessOrganization,
  getAccessContext,
  heldMembershipIn,
  isRootAdministrator,
} from "@/features/auth"
import {
  getOrganizationBySlug,
  getRootOrganization,
  listOrganizations,
} from "@/features/organizations"
import {
  SidebarInset,
  SidebarProvider,
} from "@/features/shared/components/ui/sidebar"

type OrgLayoutProps = {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: Omit<OrgLayoutProps, "children">): Promise<Metadata> {
  const { slug } = await params
  const [t, currentOrganization] = await Promise.all([
    getTranslations("app.metadata"),
    getOrganizationBySlug(slug),
  ])
  const rootOrganization = currentOrganization
    ? undefined
    : await getRootOrganization()
  const organizationName = currentOrganization?.name ?? rootOrganization?.name

  return {
    title: organizationName
      ? `${t("title")} | ${organizationName}`
      : t("title"),
  }
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { slug } = await params
  const access = await getAccessContext()

  if (!access.user) {
    redirect(`/org/${slug}/logout`)
  }

  if (!access.user.emailVerified) {
    redirect(`/org/${slug}/verify-email`)
  }

  const currentOrganization = await getOrganizationBySlug(slug)

  if (!currentOrganization) {
    notFound()
  }

  const membership = heldMembershipIn(access, currentOrganization.id)

  if (!membership) {
    redirect(`/org/${slug}/forbidden`)
  }

  if (!canAccessOrganization(membership)) {
    redirect(`/org/${slug}/suspended`)
  }

  // Held, but granting nothing until the member enrols the second factor the
  // organization requires. Every page and action below refuses it on its own.
  if (awaitsSecondFactor(access, membership)) {
    redirect(`/org/${slug}/setup-security`)
  }

  const organizationsPromise = listOrganizations()
  const userPromise = Promise.resolve(access.user)
  const capabilities = await appCapabilities(access, membership)

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar
        canCreateOrganization={isRootAdministrator(access)}
        capabilities={capabilities}
        currentOrganization={currentOrganization}
        organizationsPromise={organizationsPromise}
        userPromise={userPromise}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
