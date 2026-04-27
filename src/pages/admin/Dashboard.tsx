import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { dashboardQueries } from "@/queries/dashboard";
import { academicYearQueries } from "@/queries/academic-years";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import {
  Users,
  FileText,
  CreditCard,
  Calendar,
  ClipboardList,
  Building2,
} from "lucide-react";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { SecurityAlerts } from "@/components/admin/security/SecurityAlerts";
import { StudentsAtRiskWidget } from "@/components/dashboard/widgets/StudentsAtRiskWidget";

import { AnalyticsReportButton } from "@/components/dashboard/AnalyticsReportButton";

const Dashboard = () => {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { StudentsLabel } = useStudentLabel();
  const { getTenantUrl } = useTenantUrl();

  // Use React Query for dashboard stats with automatic caching
  const { data: stats, isLoading } = useQuery({
    ...dashboardQueries.stats(tenant?.id || ''),
    enabled: !!tenant,
  });

  // Fetch academic years to determine the current one
  const { data: academicYears } = useQuery({
    ...academicYearQueries.all(tenant?.id || ''),
    enabled: !!tenant,
  });
  const currentAcademicYear = academicYears?.find(y => y.is_current)?.name || null;

  const statsCards = [
    { label: t("dashboard.statStudents", { label: StudentsLabel }), value: stats?.totalStudents || 0, icon: Users, color: "bg-primary" },
    { label: t("dashboard.statPendingAdmissions"), value: stats?.pendingAdmissions || 0, icon: ClipboardList, color: "bg-info" },
    { label: t("dashboard.statPendingInvoices"), value: stats?.pendingInvoices || 0, icon: CreditCard, color: "bg-warning" },
    { label: t("dashboard.statAcademicYear"), value: currentAcademicYear || "—", icon: Calendar, color: "bg-success" },
  ];

  const quickActions = [
    { label: t("dashboard.quickAdmissions"), href: getTenantUrl("/admin/admissions"), icon: ClipboardList },
    { label: StudentsLabel, href: getTenantUrl("/admin/students"), icon: Users },
    { label: t("dashboard.quickGrades"), href: getTenantUrl("/admin/grades"), icon: FileText },
    { label: t("dashboard.quickFinances"), href: getTenantUrl("/admin/finances"), icon: CreditCard },
  ];

  // Show loading state
  if (tenantLoading || isLoading) {
    return <DashboardSkeleton />;
  }

  // Show setup wizard if no tenant
  if (!tenant) {
    return (
      <div className="space-y-6">
        <div className="mb-8">
          <h2 className="text-2xl font-display font-bold mb-2">
            {t("dashboard.welcomeNoTenant", { name: profile?.first_name || "Admin" })}
          </h2>
          <p className="text-muted-foreground">
            {t("dashboard.noTenantDesc")}
          </p>
        </div>

        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Building2 className="w-5 h-5" />
              {t("dashboard.createTenantTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {t("dashboard.createTenantDesc")}
            </p>
            <Link to={getTenantUrl("/admin/create-tenant")}>
              <Button size="lg">
                <Building2 className="w-4 h-4 mr-2" />
                {t("dashboard.createTenantBtn")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold mb-2">
            {t("dashboard.hello", { name: profile?.first_name || "Admin" })}
          </h2>
          <p className="text-muted-foreground">
            {t("dashboard.welcomeTenant")} <span className="font-medium text-foreground">{tenant.name}</span>
          </p>
        </div>
        <AnalyticsReportButton />
      </div>


      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: index * 0.1,
              ease: [0.22, 1, 0.36, 1]
            }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }}
            className="glass-card p-6 shadow-premium relative overflow-hidden group"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-10 transition-opacity group-hover:opacity-20 ${stat.color}`} />
            <div className="flex items-start justify-between relative z-10">
              <div>
                <p className="text-sm text-muted-foreground font-medium mb-1">{stat.label}</p>
                <p className="text-3xl font-display font-bold tracking-tight">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-2xl ${stat.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <stat.icon className="w-6 h-6 text-primary-foreground" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts & Analytics Section */}
      <div className="grid lg:grid-cols-4 gap-8">
        <div className="lg:col-span-2">
          <DashboardCharts />
        </div>
        <div className="lg:col-span-1">
          <StudentsAtRiskWidget />
        </div>
        <div className="lg:col-span-1">
          <SecurityAlerts />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-display font-semibold mb-4">{t("dashboard.quickActions")}</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Link
              key={action.label}
              to={action.href}
              className="card-elevated p-5 flex items-center gap-4 group animate-fade-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <action.icon className="w-6 h-6 text-primary group-hover:text-primary-foreground" />
              </div>
              <span className="font-medium">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Setup reminder if no academic year */}
      {!currentAcademicYear && (
        <Card className="border-info/50 bg-info/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-info/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-info" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{t("dashboard.setupAcademicYearTitle")}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("dashboard.setupAcademicYearDesc")}
                </p>
                <Link to={getTenantUrl("/admin/academic-years")}>
                  <Button variant="default" size="sm">
                    {t("dashboard.setupAcademicYearBtn")}
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <OnboardingTour />
    </div>
  );
};

export default Dashboard;
