import { headers } from "next/headers"

import { AppSidebar } from "@/features/app"
import { auth } from "@/features/auth"
import { SidebarProvider } from "@/features/shared/components/ui/sidebar"

export default async function OrgLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const organizationsPromise = auth.api.listOrganizations({
    headers: await headers(),
  })
  return (
    <SidebarProvider>
      <AppSidebar organizationsPromise={organizationsPromise} />
      {children}
    </SidebarProvider>
  )
}
