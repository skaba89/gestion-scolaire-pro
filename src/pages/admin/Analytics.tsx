import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format, subMonths, eachMonthOfInterval, startOfMonth, endOfMonth, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { adminQueries } from "@/queries/admin";
import { apiClient } from "@/api/client";

// Modular components
import { AnalyticsHeader } from "@/components/admin/analytics/AnalyticsHeader";
import { AnalyticsKPIs } from "@/components/admin/analytics/AnalyticsKPIs";
import { AnalyticsSecondaryStats } from "@/components/admin/analytics/AnalyticsSecondaryStats";
import { AnalyticsAttendanceTab } from "@/components/admin/analytics/AnalyticsAttendanceTab";
import { AnalyticsGradesTab } from "@/components/admin/analytics/AnalyticsGradesTab";
import { AnalyticsFinancesTab } from "@/components/admin/analytics/AnalyticsFinancesTab";
import { AnalyticsAITab } from "@/components/admin/analytics/AnalyticsAITab";

export default function Analytics() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { formatCurrency, formatCurrencyCompact } = useCurrency();
  const { StudentsLabel } = useStudentLabel();

  const [selectedPeriod, setSelectedPeriod] = useState<string>("month");

  // Centralized KPIs query
  const { data: stats, isLoading: isKpisLoading } = useQuery({
    ...adminQueries.analyticsKPIs(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Attendance trend
  const { data: attendanceTrend } = useQuery({
    queryKey: ["analytics-attendance-trend", tenant?.id, selectedPeriod],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const response = await apiClient.get('/analytics/attendance-trend', {
        params: { period: selectedPeriod }
      });
      // Format the date for display (e.g. from "YYYY-MM-DD" to "DD/MM")
      const items = Array.isArray(response.data) ? response.data : [];
      return items.map((item: any) => ({
        ...item,
        date: format(new Date(item.date), "dd/MM", { locale: fr })
      }));
    },
    enabled: !!tenant?.id,
  });

  // Grades distribution
  const { data: gradesDistribution } = useQuery({
    queryKey: ["analytics-grades-distribution", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const response = await apiClient.get('/analytics/grades-distribution');
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((item: any) => ({
        range: item.range,
        count: item.count,
        fill: item.range === "16-20" ? "hsl(142, 76%, 36%)"
          : item.range === "14-16" ? "hsl(160, 60%, 45%)"
            : item.range === "12-14" ? "hsl(199, 89%, 48%)"
              : item.range === "10-12" ? "hsl(38, 92%, 50%)"
                : item.range === "5-10" ? "hsl(25, 95%, 53%)"
                  : "hsl(0, 84%, 60%)",
      }));
    },
    enabled: !!tenant?.id,
  });

  // Monthly revenue
  const { data: revenueData } = useQuery({
    queryKey: ["analytics-revenue", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const response = await apiClient.get('/analytics/revenue-trend', {
        params: { months: 12 }
      });

      // Response gives { period: "YYYY-MM", revenue: X, paid: Y, pending: Z }
      // We want to format "period" into "MMM" (ex: "janv.")
      const data = Array.isArray(response.data) ? response.data : [];
      return data.map((item: any) => ({
        month: format(new Date(item.period + "-01"), "MMM", { locale: fr }),
        montant: item.revenue
      }));
    },
    enabled: !!tenant?.id,
  });

  // Subjects performance
  const { data: subjectPerformance } = useQuery({
    queryKey: ["analytics-subjects", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const response = await apiClient.get('/analytics/academic-stats');
      // Returns { bySubject: [...], byClass: [...] }
      // We want name and moyenne
      return (response.data.bySubject || [])
        .map((s: any) => ({
          name: s.subject_name,
          moyenne: s.average_grade
        }))
        .sort((a: any, b: any) => b.moyenne - a.moyenne)
        .slice(0, 10);
    },
    enabled: !!tenant?.id,
  });

  return (
    <div className="space-y-6">
      <AnalyticsHeader
        title={t("analytics.title", "Analytics Avancés")}
        subtitle={t("analytics.subtitle", "Vue d'ensemble complète de votre établissement")}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        onExport={() => { }}
      />

      <AnalyticsKPIs
        totalStudents={stats?.totalStudents || 0}
        attendanceRate={stats?.attendanceRate || 0}
        avgGrade={stats?.avgGrade || "—"}
        collectionRate={stats?.collectionRate || 0}
        studentsLabel={StudentsLabel}
      />

      <AnalyticsSecondaryStats
        teacherCount={stats?.teacherCount || 0}
        classroomCount={stats?.classroomCount || 0}
        collectedRevenue={stats?.collectedRevenue || 0}
        pendingRevenue={stats?.pendingRevenue || 0}
        formatCurrency={formatCurrency}
      />

      <Tabs defaultValue="attendance" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="attendance" className="px-6">Assiduité</TabsTrigger>
          <TabsTrigger value="grades" className="px-6">Notes</TabsTrigger>
          <TabsTrigger value="finances" className="px-6">Finances</TabsTrigger>
          <TabsTrigger value="ai" className="px-6 flex items-center gap-2">
            AI Insights
            <Badge variant="secondary" className="ml-1 h-5 px-1 bg-primary/10 text-primary border-none">Bêta</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attendance" className="space-y-6 focus-visible:outline-none">
          <AnalyticsAttendanceTab data={attendanceTrend || []} />
        </TabsContent>

        <TabsContent value="grades" className="space-y-6 focus-visible:outline-none">
          <AnalyticsGradesTab
            gradesDistribution={gradesDistribution || []}
            subjectPerformance={subjectPerformance || []}
          />
        </TabsContent>

        <TabsContent value="finances" className="space-y-6 focus-visible:outline-none">
          <AnalyticsFinancesTab
            revenueData={revenueData || []}
            totalRevenue={stats?.totalRevenue || 0}
            collectedRevenue={stats?.collectedRevenue || 0}
            pendingRevenue={stats?.pendingRevenue || 0}
            formatCurrency={formatCurrency}
            formatCurrencyCompact={formatCurrencyCompact}
          />
        </TabsContent>

        <TabsContent value="ai" className="space-y-6 focus-visible:outline-none">
          <AnalyticsAITab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
