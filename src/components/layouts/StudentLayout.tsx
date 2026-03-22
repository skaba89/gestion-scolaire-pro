import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  MessageSquare,
  RefreshCw,
  BookOpen,
  Briefcase
} from "lucide-react";
import { ChatBot } from "@/components/chat/ChatBot";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";

export const StudentLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

  const navItems = [
    { href: getTenantUrl("/student"), label: "Tableau de bord", icon: LayoutDashboard },
    { href: getTenantUrl("/student/grades"), label: "Mes Notes", icon: FileText },
    { href: getTenantUrl("/student/homework"), label: "Devoirs", icon: BookOpen },
    { href: getTenantUrl("/student/schedule"), label: "Emploi du temps", icon: Calendar },
    { href: getTenantUrl("/student/careers"), label: "Carrières & Stages", icon: Briefcase },
    { href: getTenantUrl("/student/messages"), label: "Messages", icon: MessageSquare },
    { href: getTenantUrl("/student/pre-registration"), label: "Pré-inscription", icon: RefreshCw },
  ];

  const mobileNavItems = [
    { href: getTenantUrl("/student"), label: "Accueil", icon: LayoutDashboard },
    { href: getTenantUrl("/student/grades"), label: "Notes", icon: FileText },
    { href: getTenantUrl("/student/homework"), label: "Devoirs", icon: BookOpen },
    { href: getTenantUrl("/student/schedule"), label: "Emploi", icon: Calendar },
    { href: getTenantUrl("/student/messages"), label: "Messages", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName="Espace Étudiant"
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
