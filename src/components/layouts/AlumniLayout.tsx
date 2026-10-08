import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
import { sidebarOffsetClass, useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { cn } from "@/lib/utils";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  GraduationCap,
} from "lucide-react";

export function AlumniLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed } = useSidebarCollapsed();
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

  useRealtimeMessages();

  const navItems = [
    {
      href: getTenantUrl("/alumni"),
      icon: LayoutDashboard,
      label: "Tableau de bord",
    },
    {
      href: getTenantUrl("/alumni/document-requests"),
      icon: FileText,
      label: "Documents",
    },
    {
      href: getTenantUrl("/alumni/messages"),
      icon: MessageSquare,
      label: "Messages",
    },
    {
      href: getTenantUrl("/alumni/careers"),
      icon: GraduationCap,
      label: "Carrières",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName="Espace Alumni"
        navItems={navItems}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content */}
      <main className={cn(sidebarOffsetClass(collapsed), "pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen transition-[margin] duration-300")}>
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <div className="page-container">
              <Outlet />
            </div>
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav items={navItems} />
    </div>
  );
}
