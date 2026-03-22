import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  BarChart3,
  Home,
  Users,
  ClipboardCheck,
  MessageSquare,
  BookOpen,
  QrCode
} from "lucide-react";
import { ChatBot } from "@/components/chat/ChatBot";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";

export const TeacherLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

  const navItems = [
    { href: getTenantUrl("/teacher"), label: "Tableau de bord", icon: Home },
    { href: getTenantUrl("/teacher/classes"), label: "Mes Classes", icon: Users },
    { href: getTenantUrl("/teacher/grades"), label: "Notes", icon: BarChart3 },
    { href: getTenantUrl("/teacher/attendance"), label: "Présences", icon: ClipboardCheck },
    { href: getTenantUrl("/teacher/session-attendance"), label: "Badges", icon: QrCode },
    { href: getTenantUrl("/teacher/homework"), label: "Devoirs", icon: BookOpen },
    { href: getTenantUrl("/teacher/messages"), label: "Messages", icon: MessageSquare },
  ];

  const mobileNavItems = [
    { href: getTenantUrl("/teacher"), label: "Accueil", icon: Home },
    { href: getTenantUrl("/teacher/classes"), label: "Classes", icon: Users },
    { href: getTenantUrl("/teacher/grades"), label: "Notes", icon: BarChart3 },
    { href: getTenantUrl("/teacher/attendance"), label: "Présences", icon: ClipboardCheck },
    { href: getTenantUrl("/teacher/messages"), label: "Messages", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName="Espace Professeur"
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
