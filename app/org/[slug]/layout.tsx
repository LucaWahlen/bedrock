import { SidebarProvider } from "@/features/shared/components/ui/sidebar";
import { AppSidebar } from "@/features/app/components/app-sidebar";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
    return (
        <SidebarProvider>
            <AppSidebar />
            {children}
        </SidebarProvider>
    );
}
