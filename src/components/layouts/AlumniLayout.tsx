import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
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
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

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
      <div className="lg:pl-72">
        <main className="p-4 md:p-6 lg:p-8 pt-20 lg:pt-8 pb-24 lg:pb-8">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <div className="max-w-7xl mx-auto">
                <Outlet />
              </div>
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav items={navItems} />
    </div>
  );
}
