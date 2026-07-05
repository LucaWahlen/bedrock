import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AppSidebar } from "@/features/app"
import { auth } from "@/features/auth"
import { SidebarProvider } from "@/features/shared/components/ui/sidebar"

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect(`/org/${slug}/logout`)
  }

  const organizationsPromise = auth.api.listOrganizations({
    headers: await headers(),
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
