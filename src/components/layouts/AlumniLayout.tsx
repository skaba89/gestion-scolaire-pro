import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

  const { t } = useTranslation();

  const navItems = [
    {
      href: getTenantUrl("/alumni"),
      icon: LayoutDashboard,
      label: t("nav.dashboard"),
    },
    {
      href: getTenantUrl("/alumni/document-requests"),
      icon: FileText,
      label: t("nav.documents"),
    },
    {
      href: getTenantUrl("/alumni/messages"),
      icon: MessageSquare,
      label: t("nav.messages"),
    },
    {
      href: getTenantUrl("/alumni/careers"),
      icon: GraduationCap,
      label: t("nav.careersShort"),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName={t("portal.alumniSpace")}
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
