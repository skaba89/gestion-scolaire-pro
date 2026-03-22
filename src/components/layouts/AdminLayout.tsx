import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import {
  GraduationCap,
  Users,
  BookOpen,
  CreditCard,
  BarChart3,
  Home,
  Settings,
  LogOut,
  Menu,
  X,
  Calendar,
  CalendarDays,
  Layers,
  Clock,
  School,
  FileText,
  UsersRound,
  Activity,
  QrCode,
  MessageSquare,
  UserCheck,
  Building2,
  Award,
  Library,
  CalendarCheck,
  Monitor,
  Download,
  Brain,
  PartyPopper,
  UsersIcon,
  Briefcase,
  Receipt,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  UserCog,
  Wallet,
  ClipboardList,
  Megaphone,
  Cog,
  Shield,
  TestTube2,
  ShoppingCart,
  Package,
  Target,
  ScanLine,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useMemo, useEffect } from "react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ChatBot } from "@/components/chat/ChatBot";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { TenantBranding } from "@/components/TenantBranding";
import { TenantSwitcher } from "@/components/layouts/TenantSwitcher";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { PageTransition } from "@/components/layouts/PageTransition";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useSettings } from "@/hooks/useSettings";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { Permission, hasPermission } from "@/lib/permissions";
import { useTerminology } from "@/hooks/useTerminology";
import { GlobalSearch } from "@/components/search/GlobalSearch";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  permission?: Permission; // Added Permission check
}

interface NavSection {
  id: string;
  title: string;
  icon: any;
  items: NavItem[];
  defaultOpen?: boolean;
}

export const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug: string }>(); // Hook for tenant-aware routing
  const { signOut, profile, hasRole, roles } = useAuth(); // Needed roles for permission check
  console.log("AdminLayout mounting, profile:", profile?.email, "roles:", roles);
  const { studentsLabel, StudentsLabel } = useStudentLabel();
  const { termLabel, termsLabel, levelLabel, classroomLabel, subjectLabel, subjectsLabel, isUniversity } = useTerminology();
  const { settings } = useSettings();
  const { getTenantUrl } = useTenantUrl();
  const { tenant } = useTenant(); // Add useTenant hook

  // Activate Real-time Sync
  useRealtimeSync();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useTranslation();

  const isLeft = settings?.sidebar_position !== "right";
  const isCompact = settings?.sidebar_layout === "compact";
  const menuConfig = settings?.menu_config || {};

  const isSuperAdmin = hasRole("SUPER_ADMIN");

  // Global Search State
  const [searchOpen, setSearchOpen] = useState(false);

  // Keyboard Shortcut for Search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Redirection Logic for Onboarding
  useEffect(() => {
    if (tenant && !tenant.settings?.onboarding_completed && (hasRole("TENANT_ADMIN") || hasRole("DIRECTOR"))) {
      const onboardingUrl = getTenantUrl("/admin/onboarding");
      const safeOnboardingUrl = onboardingUrl.startsWith(`/${tenantSlug}/`) || onboardingUrl === `/${tenantSlug}`
        ? onboardingUrl
        : `/${tenantSlug}/admin/onboarding`;

      if (location.pathname !== safeOnboardingUrl && location.pathname !== `/${tenantSlug}/admin/onboarding`) {
        navigate(safeOnboardingUrl, { replace: true });
      }
    }
  }, [tenant, hasRole, getTenantUrl, tenantSlug, location.pathname, navigate]);

  // Define all sections with permissions
  const allNavSections: NavSection[] = [
    {
      id: "overview",
      title: t("nav.overview", "Vue d'ensemble"),
      icon: LayoutDashboard,
      defaultOpen: true,
      items: [
        { href: getTenantUrl("/admin"), label: t("nav.dashboard"), icon: Home, permission: "dashboard:admin" },
        { href: getTenantUrl("/admin/analytics"), label: t("nav.analytics"), icon: BarChart3, permission: "dashboard:admin" },
        { href: getTenantUrl("/admin/ai-insights"), label: t("nav.aiInsights"), icon: Brain, permission: "ai:read" },
        { href: getTenantUrl("/admin/decision-support"), label: isUniversity ? "Analyse Stratégique" : "Tableau Décisionnel", icon: Target, permission: "dashboard:admin" },
        { href: getTenantUrl("/admin/ministry-reporting"), label: isUniversity ? "Reporting de l'Enseignement Supérieur" : "Reporting Institutionnel", icon: Shield, permission: "dashboard:admin" },
        ...(isSuperAdmin ? [{ href: getTenantUrl("/admin/tenants"), label: "Établissements", icon: Building2 }] : []),
      ],
    },
    {
      id: "guides",
      title: t("nav.guides", "Guides"),
      icon: BookOpen,
      defaultOpen: true,
      items: [
        { href: getTenantUrl("/admin/testing-guide"), label: t("nav.testingGuide", "Guide de test"), icon: TestTube2, permission: "guides:read" },
        { href: getTenantUrl("/admin/university-guide"), label: isUniversity ? "Guide Universitaire" : "Guide de l'école", icon: BookOpen, permission: "guides:read" },
      ],
    },
    {
      id: "academicManagement",
      title: t("nav.academicManagement", "Gestion Académique"),
      icon: GraduationCap,
      items: [
        { href: getTenantUrl("/admin/admissions"), label: t("nav.admissions"), icon: BookOpen, permission: "admissions:read" },
        { href: getTenantUrl("/admin/students"), label: StudentsLabel, icon: Users, permission: "students:read" },
        { href: getTenantUrl("/admin/class-lists"), label: isUniversity ? "Listes d'Inscriptions" : "Listes de Classe", icon: ClipboardList, permission: "students:read" },
        { href: getTenantUrl("/admin/enrollments"), label: t("nav.enrollments"), icon: UserCheck, permission: "enrollments:read" },
        { href: getTenantUrl("/admin/teachers"), label: t("nav.teachers"), icon: GraduationCap, permission: "teachers:read" },
        { href: getTenantUrl("/admin/grades"), label: t("nav.grades"), icon: BarChart3, permission: "grades:read" },
        { href: getTenantUrl("/admin/report-cards"), label: t("nav.reportCards"), icon: FileText, permission: "report_cards:read" },
        { href: getTenantUrl("/admin/certificates"), label: t("nav.certificates"), icon: Award, permission: "certificates:read" },
        { href: getTenantUrl("/admin/scan"), label: "Scan Présence", icon: ScanLine, permission: "attendance:read" },
      ],
    },
    {
      id: "structure",
      title: t("nav.structure", "Structure"),
      icon: Building2,
      defaultOpen: true,
      items: [
        { href: getTenantUrl("/admin/academic-years"), label: t("nav.academicYears"), icon: Calendar, permission: "academic_years:manage" },
        { href: getTenantUrl("/admin/terms"), label: termsLabel, icon: CalendarDays, permission: "terms:manage" },
        { href: getTenantUrl("/admin/levels"), label: levelLabel, icon: Layers, permission: "levels:manage" },
        { href: getTenantUrl("/admin/classrooms"), label: classroomLabel, icon: School, permission: "classrooms:manage" },
        { href: getTenantUrl("/admin/subjects"), label: subjectsLabel, icon: FileText, permission: "subjects:manage" },
        { href: getTenantUrl("/admin/campuses"), label: t("nav.campuses"), icon: Home, permission: "settings:manage" },
        { href: getTenantUrl("/admin/departments"), label: t("nav.departments"), icon: Building2, permission: "departments:read" },
      ],
    },
    {
      id: "planning",
      title: t("nav.planning", "Planification"),
      icon: Calendar,
      defaultOpen: true,
      items: [
        { href: getTenantUrl("/admin/schedule"), label: t("nav.schedule"), icon: Clock, permission: "schedule:read" },
        { href: getTenantUrl("/admin/calendar"), label: t("nav.calendar"), icon: CalendarDays, permission: "settings:read" }, // Calendar often global
        { href: getTenantUrl("/admin/bookings"), label: t("nav.bookings"), icon: CalendarCheck, permission: "rooms:read" },
        { href: getTenantUrl("/admin/events"), label: t("nav.events", "Événements"), icon: PartyPopper, permission: "events:read" },
      ],
    },
    {
      id: "attendance",
      title: t("nav.attendance", "Présences"),
      icon: Activity,
      items: [
        { href: getTenantUrl("/admin/badges"), label: t("nav.badges"), icon: QrCode, permission: "attendance:manage" },
        { href: getTenantUrl("/admin/live-attendance"), label: t("nav.liveAttendance"), icon: Activity, permission: "attendance:read" },
        { href: getTenantUrl("/admin/teacher-hours"), label: t("nav.teacherHours"), icon: Clock, permission: "teacher_progress:read" },
      ],
    },
    {
      id: "financesSection",
      title: t("nav.financesSection", "Finances"),
      icon: Wallet,
      items: [
        { href: getTenantUrl("/admin/finances"), label: t("nav.finances"), icon: CreditCard, permission: "fees:read" },
        { href: getTenantUrl("/admin/inventory"), label: "Inventaire", icon: Package, permission: "invoices:read" },
        { href: getTenantUrl("/admin/orders"), label: "Réception Commandes", icon: ShoppingCart, permission: "invoices:read" },
        { href: getTenantUrl("/admin/accounting-exports"), label: t("nav.accountingExports", "Exports Comptables"), icon: Receipt, permission: "fees:manage" },
      ],
    },
    {
      id: "learning",
      title: t("nav.learning", "Apprentissage"),
      icon: Monitor,
      items: [
        { href: getTenantUrl("/admin/elearning"), label: t("nav.elearning"), icon: Monitor, permission: "homework:read" },
        { href: getTenantUrl("/admin/library"), label: t("nav.library"), icon: Library, permission: "homework:read" }, // Loose permission mapping
        { href: getTenantUrl("/admin/marketplace"), label: "Marketplace Éducatif", icon: ShoppingCart, permission: "homework:read" },
        { href: getTenantUrl("/admin/gamification"), label: t("nav.gamification"), icon: Award, permission: "students:read" },
      ],
    },
    {
      id: "studentLife",
      title: t("nav.studentLife", "Vie Étudiante"),
      icon: UsersIcon,
      items: [
        { href: getTenantUrl("/admin/clubs"), label: t("nav.clubs", "Clubs"), icon: UsersIcon, permission: "events:read" },
        { href: getTenantUrl("/admin/careers"), label: t("nav.careers", "Carrières & Stages"), icon: GraduationCap, permission: "students:read" },
        { href: getTenantUrl("/admin/alumni-mentors"), label: t("nav.alumniMentors", "Mentors Alumni"), icon: Users, permission: "users:read" },
        { href: getTenantUrl("/admin/alumni-requests"), label: t("nav.alumniRequests", "Requêtes Alumni"), icon: FileText, permission: "users:read" },
      ],
    },
    {
      id: "communication",
      title: t("nav.communication", "Communication"),
      icon: Megaphone,
      items: [
        { href: getTenantUrl("/admin/messages"), label: t("nav.messages"), icon: MessageSquare, permission: "messages:read" },
        { href: getTenantUrl("/admin/announcements"), label: t("nav.announcements", "Annonces"), icon: Megaphone, permission: "messages:admin" },
      ],
    },
    {
      id: "administration",
      title: t("nav.administration", "Administration"),
      icon: Cog,
      items: [
        { href: getTenantUrl("/admin/users"), label: t("nav.users"), icon: UsersRound, permission: "users:read" },
        { href: getTenantUrl("/admin/hr"), label: t("nav.hr", "Ressources Humaines"), icon: Briefcase, permission: "users:update" }, // HR requires restricted access
        { href: getTenantUrl("/admin/security"), label: t("nav.security", "Sécurité"), icon: Shield, permission: "tenant:manage" },
        { href: getTenantUrl("/admin/exports"), label: t("nav.exports"), icon: Download, permission: "students:export" },
        { href: getTenantUrl("/admin/audit-logs"), label: t("nav.auditLogs"), icon: Activity, permission: "tenant:manage" },
        { href: getTenantUrl("/admin/data-quality"), label: "Qualité des Données", icon: Activity, permission: "settings:manage" },
        { href: getTenantUrl("/admin/settings"), label: t("nav.settings"), icon: Settings, permission: "settings:read" },
      ],
    },
  ];

  // Filter sections and items based on permissions
  const navSections = useMemo(() => {
    return allNavSections
      .map(section => {
        // Filter items based on permission
        const filteredItems = section.items.filter(item => {
          if (!item.permission) return true; // Show if no permission required (public/basic)
          return hasPermission(roles, item.permission);
        });

        return {
          ...section,
          items: filteredItems,
          title: menuConfig[section.id]?.label || section.title
        };
      })
      .filter(section => {
        // Only show section if it has items and is enabled in config
        return section.items.length > 0 && menuConfig[section.id]?.enabled !== false;
      });
  }, [allNavSections, roles, menuConfig]); // Recalculate when roles change

  // Mobile bottom nav items - most used actions
  const mobileNavItems = [
    { href: getTenantUrl("/admin"), label: t("nav.dashboard"), icon: Home },
    { href: getTenantUrl("/admin/students"), label: StudentsLabel, icon: Users },
    { href: getTenantUrl("/admin/scan"), label: "Scan", icon: ScanLine },
    { href: getTenantUrl("/admin/finances"), label: t("nav.finances"), icon: CreditCard },
    { href: getTenantUrl("/admin/messages"), label: t("nav.messages"), icon: MessageSquare },
    { href: getTenantUrl("/admin/settings"), label: t("nav.settings"), icon: Settings },
  ].filter(item => {
    // Basic filter for mobile nav items using same permission logic manually mapped
    if (item.href.includes("students")) return hasPermission(roles, "students:read");
    if (item.href.includes("finances")) return hasPermission(roles, "fees:read");
    if (item.href.includes("messages")) return hasPermission(roles, "messages:read");
    if (item.href.includes("settings")) return hasPermission(roles, "settings:read");
    return true; // Dashboard always visible usually
  });

  const isItemActive = (href: string) => {
    return location.pathname === href ||
      (href !== getTenantUrl("/admin") && location.pathname.startsWith(href));
  };

  const isSectionActive = (section: NavSection) => {
    return section.items.some(item => isItemActive(item.href));
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <ScrollProgress />
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-xl border-b border-border flex items-center justify-between px-3 z-50 safe-top">
        <TenantBranding size="sm" showName={true} />
        <div className="flex items-center gap-1">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="touch-target"
            aria-label={sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <div className={cn("flex", !isLeft && "flex-row-reverse")}>
        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-4 border-b border-border hidden lg:block">
              <TenantBranding subtitle={t("portal.adminSpace")} />
            </div>

            <div className="mt-4">
              <TenantSwitcher />
            </div>

            {/* Mobile close button */}
            <div className="p-3 border-b border-border lg:hidden flex items-center justify-between mt-14">
              <TenantBranding size="sm" showName={true} />
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-2 overflow-y-auto no-scrollbar">
              {navSections.map((section, index) => (
                <NavSectionComponent
                  key={index}
                  section={section}
                  isActive={isSectionActive(section)}
                  isItemActive={isItemActive}
                  onItemClick={() => setSidebarOpen(false)}
                  isCompact={isCompact}
                />
              ))}
            </nav>

            {/* User Section */}
            <div className="p-3 border-t border-border bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white font-semibold shadow-colored">
                  {profile?.first_name?.[0]}{profile?.last_name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {profile?.first_name} {profile?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
                <div className="hidden lg:flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSearchOpen(true)}
                    title="Rechercher (Ctrl+K)"
                    aria-label="Rechercher dans l'application"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                  <NotificationBell />
                </div>
              </div>
              <Link to={getTenantUrl("/admin/profile")} onClick={() => setSidebarOpen(false)}>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 rounded-xl h-11 mb-2 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <UserCog className="w-4 h-4" />
                  {t("nav.profile", "Mon Profil")}
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl h-11"
                onClick={signOut}
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
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 pt-14 lg:pt-0 pb-20 lg:pb-0 min-h-screen w-full overflow-x-hidden">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <div className="page-container">
                <Outlet />
              </div>
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav items={mobileNavItems} />

      {/* ChatBot */}
      <ChatBot />

      {/* Global Search */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
};

interface NavSectionComponentProps {
  section: NavSection;
  isActive: boolean;
  isItemActive: (href: string) => boolean;
  onItemClick: () => void;
  isCompact?: boolean;
}

const NavSectionComponent = ({ section, isActive, isItemActive, onItemClick, isCompact }: NavSectionComponentProps) => {
  const [isOpen, setIsOpen] = useState(section.defaultOpen || isActive);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-1">
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            isCompact && "py-1.5"
          )}
        >
          <div className="flex items-center gap-2">
            <section.icon className="w-4 h-4" />
            <span>{section.title}</span>
          </div>
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 mt-1 space-y-0.5">
        {section.items.map((item) => {
          const active = isItemActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={onItemClick}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 group relative",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                isCompact && "py-1"
              )}
            >
              <item.icon className={cn(
                "w-4 h-4 transition-transform group-hover:scale-110",
                active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"
              )} />
              <span className="truncate">{item.label}</span>
              {active && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute left-0 w-1 h-4 bg-primary-foreground rounded-r-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                />
              )}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
};