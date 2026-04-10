import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LogOut, ChevronDown, ChevronRight, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { TenantBranding } from "@/components/TenantBranding";
import { TenantSwitcher } from "./TenantSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StaggerContainer, StaggerItem } from "./PageTransition";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

interface ResponsiveSidebarProps {
  portalName: string;
  navItems?: NavItem[];
  navGroups?: NavGroup[];
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const ResponsiveSidebar = ({
  portalName,
  navItems,
  navGroups,
  sidebarOpen,
  setSidebarOpen,
}: ResponsiveSidebarProps) => {
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const { t } = useTranslation();
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev =>
      prev.includes(label)
        ? prev.filter(g => g !== label)
        : [...prev, label]
    );
  };

  const isItemActive = (href: string, basePath?: string) => {
    if (basePath && location.pathname === basePath) {
      return href === basePath;
    }
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  /** Derive a data-tour attribute from the nav item href for onboarding tour targeting. */
  const getTourAttr = (href: string): string | undefined => {
    if (/\/admin(\/dashboard)?\/?$/.test(href)) return "dashboard";
    if (href.includes("/admin/students")) return "students";
    if (href.includes("/admin/messages") || href.includes("/admin/messaging")) return "messages";
    if (href.includes("/admin/settings")) return "settings";
    return undefined;
  };

  const renderNavItem = (item: NavItem, closeSidebar = true) => {
    const isActive = isItemActive(item.href);
    const tourAttr = getTourAttr(item.href);
    return (
      <motion.div
        key={item.href}
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
      >
        <Link
          to={item.href}
          data-tour={tourAttr}
          onClick={() => closeSidebar && setSidebarOpen(false)}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden",
            isActive
              ? "bg-primary text-primary-foreground shadow-colored"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <motion.div
            initial={false}
            animate={isActive ? { scale: 1.1 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
          </motion.div>
          <span className="truncate">{item.label}</span>
          {isActive && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary-foreground rounded-r-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            />
          )}
        </Link>
      </motion.div>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    const isOpen = openGroups.includes(group.label);
    const hasActiveItem = group.items.some(item => isItemActive(item.href));

    return (
      <Collapsible
        key={group.label}
        open={isOpen || hasActiveItem}
        onOpenChange={() => toggleGroup(group.label)}
      >
        <CollapsibleTrigger className="w-full">
          <div
            className={cn(
              "flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
              hasActiveItem
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              <group.icon className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{group.label}</span>
            </div>
            {isOpen || hasActiveItem ? (
              <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform" />
            ) : (
              <ChevronRight className="w-4 h-4 flex-shrink-0 transition-transform" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-4">
            {group.items.map(item => renderNavItem(item))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 z-50 safe-top">
        <TenantBranding size="sm" showName={true} />
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <span data-tour="notifications">
            <NotificationBell />
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="touch-target"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        data-tour="sidebar"
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-card/80 backdrop-blur-xl border-r border-border/50 z-40 transition-transform duration-300 ease-out",
          "lg:translate-x-0 overflow-hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo - Desktop only */}
          <div className="p-6 border-b border-border hidden lg:block">
            <TenantBranding subtitle={portalName} />
          </div>

          <div className="mt-4 lg:mt-2">
            <TenantSwitcher />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto no-scrollbar mt-16 lg:mt-0">
            <StaggerContainer>
              {navItems?.map(item => (
                <StaggerItem key={item.href}>
                  {renderNavItem(item)}
                </StaggerItem>
              ))}
              {navGroups?.map(group => (
                <StaggerItem key={group.label}>
                  {renderNavGroup(group)}
                </StaggerItem>
              ))}
            </StaggerContainer>
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-border bg-muted/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center text-white font-semibold shadow-colored">
                {profile?.first_name?.[0]}{profile?.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              </div>
              <div className="hidden lg:flex items-center gap-1">
                <ThemeSwitcher />
                <LanguageSwitcher />
                <NotificationBell />
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 rounded-xl h-11"
              onClick={() => signOut()}
            >
              <LogOut className="w-4 h-4" />
              {t("auth.logout")}
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};
