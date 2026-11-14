import { EducationModuleGate, EducationModuleFeature } from "@/components/EducationModuleGate";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  MessageSquare,
  RefreshCw,
  BookOpen,
  Briefcase,
  GraduationCap
} from "lucide-react";
import { ChatBot } from "@/components/chat/ChatBot";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
import { sidebarOffsetClass, useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";
import { cn } from "@/lib/utils";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";

export const StudentLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed } = useSidebarCollapsed();
  const { t } = useTranslation();
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

  useRealtimeMessages();

  const navItems = [
    { href: getTenantUrl("/student"), label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: getTenantUrl("/student/grades"), label: t("nav.myGrades"), icon: FileText },
    { href: getTenantUrl("/student/homework"), label: t("nav.homework"), icon: BookOpen },
    { href: getTenantUrl("/student/courses"), label: t("studentElearning.nav"), icon: GraduationCap },
    { href: getTenantUrl("/student/schedule"), label: t("nav.schedule"), icon: Calendar },
    { href: getTenantUrl("/student/careers"), label: t("nav.careers"), icon: Briefcase },
    { href: getTenantUrl("/student/messages"), label: t("nav.messages"), icon: MessageSquare },
    { href: getTenantUrl("/student/pre-registration"), label: t("nav.preRegistration"), icon: RefreshCw },
  ];

  const mobileNavItems = [
    { href: getTenantUrl("/student"), label: t("nav.home"), icon: LayoutDashboard },
    { href: getTenantUrl("/student/grades"), label: t("nav.grades"), icon: FileText },
    { href: getTenantUrl("/student/homework"), label: t("nav.homework"), icon: BookOpen },
    { href: getTenantUrl("/student/schedule"), label: t("nav.timetableShort"), icon: Calendar },
    { href: getTenantUrl("/student/messages"), label: t("nav.messages"), icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName={t("portal.studentSpace")}
        navItems={navItems}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content */}
      <main className={cn(sidebarOffsetClass(collapsed), "pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen transition-[margin] duration-300")}>
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <div className="page-container">
              <EducationModuleGate><Outlet /></EducationModuleGate>
            </div>
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
