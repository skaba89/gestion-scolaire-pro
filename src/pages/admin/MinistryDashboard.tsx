import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { adminQueries } from "@/queries/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
    Users,
    TrendingUp,
    GraduationCap,
    Calendar,
    RefreshCcw,
    BarChart3,
    PieChart as PieChartIcon,
    Download,
    ShieldCheck
} from "lucide-react";
import { toastService } from "@/utils/toast";
import { useCurrency } from "@/hooks/useCurrency";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    Legend
} from "recharts";
import { TooltipTour } from "@/components/onboarding/OnboardingTour";
import { useStudentLabel } from "@/hooks/useStudentLabel";

export default function MinistryDashboard() {
    const { tenant } = useTenant();
    const { formatCurrency } = useCurrency();
    const { studentLabel, studentsLabel, StudentLabel, StudentsLabel } = useStudentLabel();
    const queryClient = useQueryClient();

    const { data: kpis, isLoading, refetch } = useQuery({
        ...adminQueries.ministryKPIs(tenant?.id || ""),
        enabled: !!tenant?.id,
    });

    const refreshMutation = useMutation({
        mutationFn: adminQueries.refreshMinistryDashboard,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-ministry-kpis", tenant?.id] });
            toastService.success("Données institutionnelles rafraîchies");
        },
        onError: (error: any) => {
            toastService.error("Échec du rafraîchissement", error.message);
        }
    });

    const genderData = kpis ? [
        { name: 'Garçons', value: kpis.students_male, color: '#3b82f6' },
        { name: 'Filles', value: kpis.students_female, color: '#ec4899' },
    ] : [];

    const onboardingSteps = [
        {
            target: "#ministry-stats",
            title: `Indicateurs Clés`,
            content: `Suivez ici la santé globale de votre établissement : effectifs des ${studentsLabel.toLowerCase()}, assiduité et réussite académique.`
        },
        {
            target: "#ministry-finance",
            title: "Suivi Souverain",
            content: "Visualisez en temps réel le taux de recouvrement et les revenus collectés."
        },
        {
            target: "#refresh-btn",
            title: "Actualisation",
            content: "Les données sont agrégées pour la performance. Cliquez ici pour forcer une mise à jour des indicateurs."
        }
    ];

    if (isLoading) {
        return <div className="p-8 text-center text-muted-foreground">Chargement des données institutionnelles...</div>;
    }

    return (
        <div className="space-y-8 pb-12">
            <TooltipTour steps={onboardingSteps} storageKey="ministry-tour-completed" />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <ShieldCheck className="h-8 w-8 text-primary" />
                        Reporting Institutionnel
                    </h1>
                    <p className="text-muted-foreground">Indicateurs de souveraineté et performance pour la décision politique.</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        id="refresh-btn"
                        variant="outline"
                        size="sm"
                        onClick={() => refreshMutation.mutate()}
                        disabled={refreshMutation.isPending}
                        className="gap-2"
                    >
                        <RefreshCcw className={refreshMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                        {refreshMutation.isPending ? "Rafraîchissement..." : "Actualiser (Materialized)"}
                    </Button>
                    <Button size="sm" className="gap-2" onClick={() => {
                        if (!kpis) {
                            toastService.error("Aucune donnée disponible pour l'export");
                            return;
                        }
                        try {
                            const reportData = {
                                institution: tenant?.name || 'Établissement',
                                date: new Date().toLocaleDateString('fr-FR'),
                                kpis: {
                                    total_students: kpis.total_students || 0,
                                    students_male: kpis.students_male || 0,
                                    students_female: kpis.students_female || 0,
                                    attendance_rate: kpis.attendance_rate || 0,
                                    average_grade: kpis.average_grade || 0,
                                    collection_rate: kpis.collection_rate || 0,
                                    total_revenue_expected: kpis.total_revenue_expected || 0,
                                    total_revenue_collected: kpis.total_revenue_collected || 0,
                                }
                            };
                            const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `rapport_etat_${tenant?.slug || 'export'}_${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            toastService.success("Rapport d'État exporté avec succès");
                        } catch {
                            toastService.error("Erreur lors de l'export du rapport");
                        }
                    }}>
                        <Download className="h-4 w-4" />
                        Exporter Rapport d'État
                    </Button>
                </div>
            </div>

            <div id="ministry-stats" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="shadow-sm border-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Total {StudentsLabel}</CardTitle>
                        <Users className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis?.total_students || 0}</div>
                        <p className="text-xs text-muted-foreground">Effectifs actifs consolidés</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Assiduité Globale</CardTitle>
                        <Calendar className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-2xl font-bold">{kpis?.attendance_rate || 0}%</div>
                        <Progress value={kpis?.attendance_rate || 0} className="h-1" />
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Moyenne Académique</CardTitle>
                        <GraduationCap className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{kpis?.average_grade || 0}/20</div>
                        <p className="text-xs text-muted-foreground">Moyenne générale de l'établissement</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-primary/5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Taux Recouvrement</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-2xl font-bold">{kpis?.collection_rate || 0}%</div>
                        <Progress value={kpis?.collection_rate || 0} className="h-1 bg-blue-100" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card id="ministry-gender" className="lg:col-span-3 shadow-lg border-primary/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <PieChartIcon className="h-5 w-5 text-primary" />
                            Démographie des {studentsLabel}
                        </CardTitle>
                        <CardDescription>Répartition des effectifs par genre</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={genderData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {genderData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card id="ministry-finance" className="lg:col-span-4 shadow-lg border-primary/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-primary" />
                            Flux Financiers Consolidés
                        </CardTitle>
                        <CardDescription>Visualisation rapide des revenus attendus vs collectés</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground font-medium">Revenus Collectés</span>
                                <span className="font-bold text-emerald-600">{formatCurrency(kpis?.total_revenue_collected || 0)}</span>
                            </div>
                            <Progress value={(kpis?.total_revenue_collected / kpis?.total_revenue_expected) * 100} className="h-3 bg-muted" />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 pt-4">
                            <div className="p-4 rounded-xl bg-muted/30 border border-muted">
                                <p className="text-xs text-muted-foreground uppercase mb-1">Total Attendu</p>
                                <p className="text-xl font-bold">{formatCurrency(kpis?.total_revenue_expected || 0)}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                                <p className="text-xs text-emerald-700 uppercase mb-1">Restant à Collecter</p>
                                <p className="text-xl font-bold text-emerald-900">
                                    {formatCurrency((kpis?.total_revenue_expected || 0) - (kpis?.total_revenue_collected || 0))}
                                </p>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                            <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                            <p className="text-sm text-primary/80 leading-tight italic">
                                "Ces indicateurs servent d'appui à la gouvernance locale pour garantir la viabilité économique du service éducatif."
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
