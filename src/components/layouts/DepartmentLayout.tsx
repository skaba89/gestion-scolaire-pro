import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  Building2,
  Users,
  BarChart3,
  Home,
  Calendar,
  Clock,
  FileText,
  Activity,
  MessageSquare,
  GraduationCap,
  Bell
} from "lucide-react";
import { ChatBot } from "@/components/chat/ChatBot";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";

export const DepartmentLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

  const navItems = [
    { href: getTenantUrl("/department"), label: t("nav.dashboard"), icon: Home },
    { href: getTenantUrl("/department/classrooms"), label: t("nav.classrooms"), icon: Building2 },
    { href: getTenantUrl("/department/students"), label: t("nav.students"), icon: Users },
    { href: getTenantUrl("/department/teachers"), label: t("nav.teachers"), icon: GraduationCap },
    { href: getTenantUrl("/department/exams"), label: "Examens", icon: FileText },
    { href: getTenantUrl("/department/attendance"), label: t("nav.attendance"), icon: Activity },
    { href: getTenantUrl("/department/schedule"), label: t("nav.schedule"), icon: Clock },
    { href: getTenantUrl("/department/calendar"), label: t("nav.calendar"), icon: Calendar },
    { href: getTenantUrl("/department/messages"), label: t("nav.messages"), icon: MessageSquare },
    { href: getTenantUrl("/department/reports"), label: "Rapports", icon: BarChart3 },
    { href: getTenantUrl("/department/alerts-history"), label: "Historique Alertes", icon: Bell },
  ];

  const mobileNavItems = [
    { href: getTenantUrl("/department"), label: t("nav.dashboard"), icon: Home },
    { href: getTenantUrl("/department/students"), label: t("nav.students"), icon: Users },
    { href: getTenantUrl("/department/attendance"), label: t("nav.attendance"), icon: Activity },
    { href: getTenantUrl("/department/schedule"), label: t("nav.schedule"), icon: Clock },
    { href: getTenantUrl("/department/messages"), label: t("nav.messages"), icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName={t("portal.departmentSpace")}
        navItems={navItems}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content */}
      <main className="lg:ml-72 pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <div className="page-container">
              <Outlet />
            </div>
          </PageTransition>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav items={mobileNavItems} />

      {/* ChatBot */}
      <ChatBot />
    </div>
  );
};
