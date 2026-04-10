import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  Users,
  FileText,
  CreditCard,
  MessageSquare,
  Home,
  RefreshCw,
  BarChart3
} from "lucide-react";
import { ChatBot } from "@/components/chat/ChatBot";
import { ResponsiveSidebar } from "@/components/layouts/ResponsiveSidebar";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";

export const ParentLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();
  const { getTenantUrl } = useTenantUrl();

  const navItems = [
    { href: getTenantUrl("/parent"), label: "Tableau de bord", icon: Home },
    { href: getTenantUrl("/parent/children"), label: "Mes Enfants", icon: Users },
    { href: getTenantUrl("/parent/analytics"), label: "Statistiques", icon: BarChart3 },
    { href: getTenantUrl("/parent/pre-registration"), label: "Pré-inscription", icon: RefreshCw },
    { href: getTenantUrl("/parent/report-cards"), label: "Bulletins", icon: FileText },
    { href: getTenantUrl("/parent/invoices"), label: "Factures", icon: CreditCard },
    { href: getTenantUrl("/parent/messages"), label: "Messages", icon: MessageSquare },
  ];

  const mobileNavItems = [
    { href: getTenantUrl("/parent"), label: "Accueil", icon: Home },
    { href: getTenantUrl("/parent/children"), label: "Enfants", icon: Users },
    { href: getTenantUrl("/parent/invoices"), label: "Factures", icon: CreditCard },
    { href: getTenantUrl("/parent/report-cards"), label: "Bulletins", icon: FileText },
    { href: getTenantUrl("/parent/messages"), label: "Messages", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <ResponsiveSidebar
        portalName="Espace Parent"
        navItems={navItems}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content */}
      <main className="lg:ml-72 pt-16 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname} className="page-container">
            <Outlet />
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
