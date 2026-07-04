import { SidebarProvider } from "@/features/shared/components/ui/sidebar"
import { AppSidebar } from "@/features/app/components/app-sidebar"
import { headers } from "next/headers"
import { auth } from "@/features/auth/lib/auth"

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
