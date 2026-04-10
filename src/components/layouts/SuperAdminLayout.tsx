import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Building2, Plus, LogOut, UserCog, Settings,
  Menu, X, Home, ChevronRight, LayoutDashboard, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { PageTransition } from "@/components/layouts/PageTransition";

const navItems = [
  { href: "/super-admin", label: "Tableau de bord", icon: LayoutDashboard, end: true },
  { href: "/super-admin/tenants", label: "Établissements", icon: Building2 },
  { href: "/super-admin/create-tenant", label: "Nouvel établissement", icon: Plus },
];

export const SuperAdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string, end?: boolean) => {
    if (end) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <ScrollProgress />
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-xl border-b border-border flex items-center justify-between px-3 z-50">
        <Link to="/super-admin" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-sm">SchoolFlow Pro</span>
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">SUPER ADMIN</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border transform transition-transform duration-200 lg:translate-x-0 lg:static ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-4 border-b border-border hidden lg:flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm">SchoolFlow Pro</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Shield className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-primary font-medium">SUPER ADMIN</span>
                </div>
              </div>
            </div>

            {/* Mobile close */}
            <div className="p-3 border-b border-border lg:hidden flex items-center justify-between mt-14">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                <span className="font-bold text-sm">Super Admin</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-2 space-y-0.5 mt-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive(item.href, item.end)
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {isActive(item.href, item.end) && (
                    <ChevronRight className="w-4 h-4 ml-auto" />
                  )}
                </Link>
              ))}
            </nav>

            {/* User Section */}
            <div className="p-3 border-t border-border bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-semibold shadow-md">
                  {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl h-11"
                onClick={signOut}
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </Button>
            </div>
          </div>
        </aside>

        {/* Overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 pt-14 lg:pt-0 min-h-screen w-full overflow-x-hidden">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <div className="p-4 lg:p-6 max-w-7xl mx-auto">
                <Outlet />
              </div>
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
