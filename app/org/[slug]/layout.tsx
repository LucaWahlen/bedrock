import { SidebarProvider } from "@/features/shared/components/ui/sidebar";
import { AppSidebar } from "@/features/app/components/app-sidebar";
import { getOrganizations } from "@/features/app/lib/queries";

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
    const organizations = await getOrganizations();

    return (
        <SidebarProvider>
            <AppSidebar organizations={organizations} />
            {children}
        </SidebarProvider>
    );
}
