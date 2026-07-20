import { headers } from "next/headers"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { cache } from "react"

import { AppSidebar } from "@/features/app"
import { auth } from "@/features/auth"
import { SidebarProvider } from "@/features/shared/components/ui/sidebar"
import { db } from "@/features/shared/lib/db"
import { member, organization } from "@/features/shared/lib/schema"

type OrgLayoutProps = {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

const getOrganization = cache((slug: string) =>
  db.query.organization.findFirst({
    where: eq(organization.slug, slug),
  })
)

export async function generateMetadata({
  params,
}: Omit<OrgLayoutProps, "children">): Promise<Metadata> {
  const { slug } = await params
  const currentOrganization = await getOrganization(slug)

  return {
    title: `App | ${currentOrganization?.name ?? "Bedrock"}`,
  }
}

export default async function OrgLayout({
  children,
  params,
}: OrgLayoutProps) {
  const { slug } = await params
  const requestHeaders = await headers()

  const session = await auth.api.getSession({ headers: requestHeaders })

  if (!session) {
    redirect(`/org/${slug}/logout`)
  }

  const currentOrganization = await getOrganization(slug)

  if (!currentOrganization) {
    notFound()
  }

  const membership = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(eq(member.userId, session.user.id), eq(organization.slug, slug))
    )
    .limit(1)

  if (membership.length === 0) {
    redirect(`/org/${slug}/forbidden`)
  }

  const organizationsPromise = auth.api.listOrganizations({
    headers: requestHeaders,
  })
  const userPromise = Promise.resolve(session.user)

  return (
    <SidebarProvider>
      <AppSidebar
        organizationsPromise={organizationsPromise}
        userPromise={userPromise}
      />
      {children}
    </SidebarProvider>
  )
}
