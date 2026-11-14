import { EducationModuleGate, EducationModuleFeature } from "@/components/EducationModuleGate";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  Users,
  FileText,
  CreditCard,
  MessageSquare,
  Home,
  RefreshCw,
  BarChart3,
  CalendarCheck
} from "lucide-react";
import { ChatBot } from "@/components/chat/ChatBot";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
import { sidebarOffsetClass, useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { cn } from "@/lib/utils";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";

export const ParentLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed } = useSidebarCollapsed();
  const { t } = useTranslation();
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

  useRealtimeMessages();

  const navItems = [
    { href: getTenantUrl("/parent"), label: t("nav.dashboard"), icon: Home },
    { href: getTenantUrl("/parent/children"), label: t("nav.myChildren"), icon: Users },
    { href: getTenantUrl("/parent/analytics"), label: t("nav.statistics"), icon: BarChart3 },
    { href: getTenantUrl("/parent/pre-registration"), label: t("nav.preRegistration"), icon: RefreshCw },
    { href: getTenantUrl("/parent/report-cards"), label: t("nav.reportCards"), icon: FileText },
    { href: getTenantUrl("/parent/invoices"), label: t("nav.invoices"), icon: CreditCard },
    { href: getTenantUrl("/parent/messages"), label: t("nav.messages"), icon: MessageSquare },
    { href: getTenantUrl("/parent/appointments"), label: t("nav.appointments"), icon: CalendarCheck },
  ];

  const mobileNavItems = [
    { href: getTenantUrl("/parent"), label: t("nav.home"), icon: Home },
    { href: getTenantUrl("/parent/children"), label: t("nav.children"), icon: Users },
    { href: getTenantUrl("/parent/invoices"), label: t("nav.invoices"), icon: CreditCard },
    { href: getTenantUrl("/parent/report-cards"), label: t("nav.reportCards"), icon: FileText },
    { href: getTenantUrl("/parent/messages"), label: t("nav.messages"), icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName={t("portal.parentSpace")}
        navItems={navItems}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content */}
      <main className={cn(sidebarOffsetClass(collapsed), "pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen transition-[margin] duration-300")}>
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname} className="page-container">
            <EducationModuleGate><Outlet /></EducationModuleGate>
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav items={mobileNavItems} />

      {/* ChatBot */}
      <EducationModuleFeature module="ai"><ChatBot /></EducationModuleFeature>
    </div>
  );
};
