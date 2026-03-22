import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { financialKPIs, academicKPIs, operationalKPIs } from "@/queries/dashboardKPIs";
import { toastService } from "@/utils/toast";
import { academicYearQueries } from "@/queries/academic-years";
import { generateDashboardPDF } from "@/utils/dashboardPdfGenerator";
import { exportToCSV } from "@/utils/exportUtils";
import { adminQueries } from "@/queries/admin";

// Modular components
import { ExecutiveDashboardHeader } from "@/components/admin/dashboard/ExecutiveDashboardHeader";
import {
    FinancialExecutiveKPIs,
    AcademicExecutiveKPIs,
    OperationalExecutiveKPIs
} from "@/components/admin/dashboard/ExecutiveKPIs";
import {
    FinancialExecutiveCharts,
    AcademicExecutiveCharts,
    OperationalExecutiveCharts
} from "@/components/admin/dashboard/ExecutiveCharts";
import { CashFlowForecastChart } from "@/components/admin/dashboard/CashFlowForecastChart";

type Period = "month" | "quarter" | "year";

export default function ExecutiveDashboard() {
    const { tenant } = useTenant();
    const queryClient = useQueryClient();
    const [period, setPeriod] = useState<Period>("month");

    // Fetch current academic year
    const { data: academicYears } = useQuery({
        ...academicYearQueries.all(tenant?.id || ""),
        enabled: !!tenant?.id,
    });

    const currentYear = academicYears?.find(y => y.is_current);
    const academicYearId = currentYear?.id || "current";

    // Calculate date range based on period
    const getDateRange = useCallback(() => {
        const now = new Date();
        const startDate = new Date();

        switch (period) {
            case "month":
                startDate.setMonth(now.getMonth() - 1);
                break;
            case "quarter":
                startDate.setMonth(now.getMonth() - 3);
                break;
            case "year":
                startDate.setFullYear(now.getFullYear() - 1);
                break;
        }

        return {
            startDate: startDate.toISOString(),
            endDate: now.toISOString(),
        };
    }, [period]);

    const { startDate, endDate } = getDateRange();

    // Queries
    const { data: revenue, refetch: refetchRevenue, isLoading: isLoadingRevenue } = useQuery({
        queryKey: ["dashboard-revenue", tenant?.id, startDate, endDate],
        queryFn: () => financialKPIs.revenue(tenant!.id, startDate, endDate),
        enabled: !!tenant?.id,
    });

    const { data: outstandingByClass, refetch: refetchOutstanding } = useQuery({
        queryKey: ["dashboard-outstanding", tenant?.id],
        queryFn: () => financialKPIs.outstandingByClass(tenant!.id),
        enabled: !!tenant?.id,
    });

    const { data: revenueTrend, refetch: refetchRevenueTrend } = useQuery({
        queryKey: ["dashboard-revenue-trend", tenant?.id],
        queryFn: () => financialKPIs.revenueTrend(tenant!.id, 6),
        enabled: !!tenant?.id,
    });

    const { data: academicData, refetch: refetchAcademicSuccess, isLoading: isLoadingAcademic } = useQuery({
        queryKey: ["dashboard-academic", tenant?.id, academicYearId],
        queryFn: () => academicKPIs.overallSuccessRate(tenant!.id, academicYearId),
        enabled: !!tenant?.id,
    });

    const { data: successByClass, refetch: refetchSuccessByClass } = useQuery({
        queryKey: ["dashboard-success-class", tenant?.id, academicYearId],
        queryFn: () => academicKPIs.successRateByClass(tenant!.id, academicYearId),
        enabled: !!tenant?.id,
    });

    const { data: successBySubject, refetch: refetchSuccessBySubject } = useQuery({
        queryKey: ["dashboard-success-subject", tenant?.id, academicYearId],
        queryFn: () => academicKPIs.successRateBySubject(tenant!.id, academicYearId),
        enabled: !!tenant?.id,
    });

    const { data: gradeEvolution, refetch: refetchGradeEvolution } = useQuery({
        queryKey: ["dashboard-grade-evolution", tenant?.id, academicYearId],
        queryFn: () => academicKPIs.gradeEvolution(tenant!.id, academicYearId),
        enabled: !!tenant?.id,
    });

    const { data: operationalData, refetch: refetchOperational, isLoading: isLoadingOperational } = useQuery({
        queryKey: ["dashboard-operational", tenant?.id, academicYearId],
        queryFn: () => operationalKPIs.dropoutRate(tenant!.id, academicYearId),
        enabled: !!tenant?.id,
    });

    const { data: enrollmentByClass, refetch: refetchEnrollment } = useQuery({
        queryKey: ["dashboard-enrollment", tenant?.id, academicYearId],
        queryFn: () => operationalKPIs.enrollmentByClass(tenant!.id, academicYearId),
        enabled: !!tenant?.id,
    });

    const { data: teacherWorkload, refetch: refetchTeacherWorkload } = useQuery({
        queryKey: ["dashboard-teacher-workload", tenant?.id, startDate, endDate],
        queryFn: () => operationalKPIs.teacherWorkload(tenant!.id, startDate, endDate),
        enabled: !!tenant?.id,
    });

    const { data: attendanceTrend, refetch: refetchAttendanceTrend } = useQuery({
        queryKey: ["dashboard-attendance-trend", tenant?.id],
        queryFn: () => operationalKPIs.attendanceTrend(tenant!.id, 6),
        enabled: !!tenant?.id,
    });

    // Risk Scores KPI
    const { data: riskScoresData, refetch: refetchRiskScores, isLoading: isLoadingRisk } = useQuery({
        queryKey: ["dashboard-risk-scores", tenant?.id, academicYearId],
        queryFn: async () => {
            const { supabase } = await import("@/integrations/supabase/client");

            const { data: currentTerm } = await supabase
                .from('terms')
                .select('id')
                .eq('tenant_id', tenant!.id)
                .eq('is_current', true)
                .single();

            if (!currentTerm) return { total: 0, critical: 0, high: 0, moderate: 0, low: 0 };

            const { data } = await supabase
                .from('student_risk_scores')
                .select('risk_level')
                .eq('tenant_id', tenant!.id)
                .eq('term_id', currentTerm.id);

            const scores = data || [];
            return {
                total: scores.length,
                critical: scores.filter(s => s.risk_level === 'CRITICAL').length,
                high: scores.filter(s => s.risk_level === 'HIGH').length,
                moderate: scores.filter(s => s.risk_level === 'MODERATE').length,
                low: scores.filter(s => s.risk_level === 'LOW').length,
            };
        },
        enabled: !!tenant?.id,
    });

    // Cash Flow Forecasts
    const { data: cashFlowForecasts, refetch: refetchForecasts } = useQuery({
        queryKey: ["dashboard-cash-flow-forecasts", tenant?.id],
        queryFn: async () => {
            const { supabase } = await import("@/integrations/supabase/client");

            const { data } = await supabase
                .from('cash_flow_forecasts')
                .select('*')
                .eq('tenant_id', tenant!.id)
                .gte('forecast_date', new Date().toISOString().split('T')[0])
                .order('forecast_date', { ascending: true })
                .limit(12); // Increased limit to show more data if available

            return data || [];
        },
        enabled: !!tenant?.id,
    });

    // Generate Forecast Mutation
    const generateForecastMutation = useMutation({
        mutationFn: () => adminQueries.calculateCashFlowForecast(tenant!.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["dashboard-cash-flow-forecasts", tenant?.id] });
            toastService.success("Prévisions générées avec succès");
        },
        onError: (error: any) => {
            toastService.error("Échec de la génération des prévisions", error.message);
        }
    });

    const handleRefresh = async () => {
        await Promise.all([
            refetchRevenue(),
            refetchOutstanding(),
            refetchRevenueTrend(),
            refetchAcademicSuccess(),
            refetchSuccessByClass(),
            refetchSuccessBySubject(),
            refetchGradeEvolution(),
            refetchOperational(),
            refetchEnrollment(),
            refetchTeacherWorkload(),
            refetchAttendanceTrend(),
            refetchRiskScores(),
            refetchForecasts(),
        ]);
        toastService.success("Données actualisées");
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: tenant?.currency || 'XAF',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const handleExportPDF = () => {
        if (!tenant) return;

        generateDashboardPDF({
            tenantName: tenant.name,
            period: period === "month" ? "Ce mois" : period === "quarter" ? "Ce trimestre" : "Cette année",
            financial: {
                totalRevenue: formatCurrency(revenue?.totalRevenue || 0),
                collectionRate: `${revenue?.collectionRate.toFixed(1) || 0}%`,
                paidRevenue: formatCurrency(revenue?.paidRevenue || 0),
                pendingRevenue: formatCurrency(revenue?.pendingRevenue || 0),
            },
            academic: {
                successRate: `${academicData?.overallSuccessRate.toFixed(1) || 0}%`,
                totalStudents: academicData?.totalStudents || 0,
                averageGrade: `${academicData?.averageGrade.toFixed(2) || 0}/20`,
                failingStudents: academicData?.failingStudents || 0,
            },
            operational: {
                attendanceRate: `${operationalData?.studentAttendanceRate.toFixed(1) || 0}%`,
                teacherAttendance: `${operationalData?.teacherAttendanceRate.toFixed(1) || 0}%`,
                enrollments: operationalData?.totalEnrollments || 0,
                dropoutRate: `${operationalData?.dropoutRate.toFixed(1) || 0}%`,
                teacherHours: `${operationalData?.totalTeacherHours || 0}h`,
            }
        });
    };

    const handleExportExcel = () => {
        const data = [
            { Categorie: "Finances", Indicateur: "Revenus Totaux", Valeur: revenue?.totalRevenue || 0 },
            { Categorie: "Finances", Indicateur: "Taux de Recouvrement", Valeur: revenue?.collectionRate || 0 },
            { Categorie: "Finances", Indicateur: "Revenus Encaissés", Valeur: revenue?.paidRevenue || 0 },
            { Categorie: "Finances", Indicateur: "Impayés", Valeur: revenue?.pendingRevenue || 0 },
            { Categorie: "Académique", Indicateur: "Taux de Réussite", Valeur: academicData?.overallSuccessRate || 0 },
            { Categorie: "Académique", Indicateur: "Moyenne Générale", Valeur: academicData?.averageGrade || 0 },
            { Categorie: "Opérationnel", Indicateur: "Présence Élèves", Valeur: operationalData?.studentAttendanceRate || 0 },
            { Categorie: "Opérationnel", Indicateur: "Présence Profs", Valeur: operationalData?.teacherAttendanceRate || 0 },
            { Categorie: "Opérationnel", Indicateur: "Heures Profs", Valeur: operationalData?.totalTeacherHours || 0 },
            { Categorie: "Opérationnel", Indicateur: "Inscriptions", Valeur: operationalData?.totalEnrollments || 0 },
            { Categorie: "Opérationnel", Indicateur: "Taux d'Abandon", Valeur: operationalData?.dropoutRate || 0 },
        ];
        exportToCSV(data, "Rapport_Direction");
        toastService.success("Export Excel réussi");
    };

    const periodLabel = period === "month" ? "ce mois" : period === "quarter" ? "ce trimestre" : "cette année";

    return (
        <div className="space-y-6">
            <ExecutiveDashboardHeader
                period={period}
                onPeriodChange={setPeriod}
                onExportPDF={handleExportPDF}
                onExportExcel={handleExportExcel}
                onRefresh={handleRefresh}
                onGenerateForecast={() => generateForecastMutation.mutate()}
                isGenerating={generateForecastMutation.isPending}
            />

            <Tabs defaultValue="financial" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4"> {/* Changed to 4 cols */}
                    <TabsTrigger value="financial">💰 Financier</TabsTrigger>
                    <TabsTrigger value="academic">📚 Académique</TabsTrigger>
                    <TabsTrigger value="operational">⚙️ Opérationnel</TabsTrigger>
                    <TabsTrigger value="forecasts">📈 Prévisions IA</TabsTrigger> {/* Added Forecasts tab */}
                </TabsList>

                <TabsContent value="financial" className="space-y-6">
                    <FinancialExecutiveKPIs
                        data={revenue}
                        period={periodLabel}
                        currency={tenant?.currency || 'XAF'}
                        isLoading={isLoadingRevenue}
                    />
                    <FinancialExecutiveCharts
                        revenueTrend={revenueTrend}
                        outstandingByClass={outstandingByClass}
                    />
                </TabsContent>

                <TabsContent value="academic" className="space-y-6">
                    <AcademicExecutiveKPIs
                        data={academicData}
                        riskScores={riskScoresData}
                        isLoading={isLoadingAcademic || isLoadingRisk}
                    />
                    <AcademicExecutiveCharts
                        successByClass={successByClass}
                        successBySubject={successBySubject}
                        gradeEvolution={gradeEvolution}
                    />
                </TabsContent>

                <TabsContent value="operational" className="space-y-6">
                    <OperationalExecutiveKPIs
                        data={operationalData}
                        isLoading={isLoadingOperational}
                    />
                    <OperationalExecutiveCharts
                        enrollmentByClass={enrollmentByClass}
                        attendanceTrend={attendanceTrend}
                        teacherWorkload={teacherWorkload}
                    />
                </TabsContent>

                <TabsContent value="forecasts" className="space-y-6">
                    {cashFlowForecasts && cashFlowForecasts.length > 0 ? (
                        <CashFlowForecastChart
                            forecasts={cashFlowForecasts as any}
                            currency={tenant?.currency || 'XAF'}
                        />
                    ) : (
                        <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                            <p className="mb-4">Aucune prévision disponible pour le moment.</p>
                            <p className="text-sm">Cliquez sur <strong>"Générer Prévisions IA"</strong> en haut de la page pour lancer l'analyse.</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
