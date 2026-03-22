import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend, Cell, PieChart, Pie
} from "recharts";
import {
    TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
    Target, BrainCircuit, Wallet, Users, LayoutDashboard,
    ArrowUpRight, ArrowDownRight, CircleDollarSign, HandCoins, FileClock, GraduationCap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { financialKPIs, academicKPIs, operationalKPIs } from "@/queries/dashboardKPIs";
import { useTranslation } from "react-i18next";
import { useTerminology } from "@/hooks/useTerminology";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useCurrency } from "@/hooks/useCurrency";
import { toast } from "sonner";

export default function DecisionDashboard() {
    const { tenant } = useTenant();
    const { t } = useTranslation();
    const { studentsLabel, studentLabel, StudentsLabel } = useStudentLabel();
    const { termLabel, levelLabel, isUniversity } = useTerminology();
    const [selectedTab, setSelectedTab] = useState("strategic");

    // Fetch Financial Trends
    const { data: revenueTrend } = useQuery({
        queryKey: ["decision-revenue-trend", tenant?.id],
        queryFn: () => financialKPIs.revenueTrend(tenant!.id, 12),
        enabled: !!tenant?.id,
    });

    // Fetch Academic Risks
    const { data: successByClass } = useQuery({
        queryKey: ["decision-success-class", tenant?.id],
        queryFn: () => academicKPIs.successRateByClass(tenant!.id, "current"),
        enabled: !!tenant?.id,
    });

    const { data: academicOverall } = useQuery({
        queryKey: ["decision-academic-overall", tenant?.id],
        queryFn: () => academicKPIs.overallSuccessRate(tenant!.id, "current"),
        enabled: !!tenant?.id,
    });

    const { data: financialData } = useQuery({
        queryKey: ["decision-financial-data", tenant?.id],
        queryFn: () => financialKPIs.revenue(tenant!.id),
        enabled: !!tenant?.id,
    });

    const { data: operationalData } = useQuery({
        queryKey: ["decision-operational-data", tenant?.id],
        queryFn: () => operationalKPIs.studentAttendanceRate(tenant!.id),
        enabled: !!tenant?.id,
    });

    const { formatCurrency, formatCurrencyCompact } = useCurrency();
    const failingStudentsCount = academicOverall?.failingStudents || 0;
    const efficiencyScore = academicOverall && operationalData ? ((academicOverall.overallSuccessRate * 0.5 + operationalData * 0.5) / 10).toFixed(1) : "8.4";

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <BrainCircuit className="h-8 w-8 text-primary" />
                        {t('decision.title', 'Tableau de Bord Décisionnel')}
                    </h1>
                    <p className="text-muted-foreground">{t('decision.subtitle', 'Analyses prédictives et indicateurs de performance stratégique.')}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => window.history.back()}>
                        <LayoutDashboard className="h-4 w-4" />
                        {t('decision.operationalView', 'Vue Opérationnelle')}
                    </Button>
                    <Button className="gap-2 shadow-lg shadow-primary/20" onClick={() => toast.success(t('common.exporting', 'Exportation en cours...'))}>
                        {t('decision.exportAnalysis', "Exporter l'Analyse")}
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="strategic" onValueChange={setSelectedTab} className="space-y-6">
                <TabsList className="flex w-full overflow-x-auto overflow-y-hidden h-auto p-1 bg-muted/50 whitespace-nowrap">
                    <TabsTrigger value="strategic" className="gap-2 flex-shrink-0">
                        <Target className="h-4 w-4" /> {t('decision.strategicView', 'Vue Stratégique')}
                    </TabsTrigger>
                    <TabsTrigger value="financial" className="gap-2 flex-shrink-0">
                        <Wallet className="h-4 w-4" /> {t('decision.financialAnalysis', 'Analyse Financière')}
                    </TabsTrigger>
                    <TabsTrigger value="academic" className="gap-2 flex-shrink-0">
                        <Users className="h-4 w-4" /> {t('decision.academicRisk', 'Risque Académique')}
                    </TabsTrigger>
                </TabsList>

                {/* Strategic Overview */}
                <TabsContent value="strategic" className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card className="relative overflow-hidden border-l-4 border-l-blue-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('decision.revenueGrowth', 'Revenus (Global)')}</CardTitle>
                                <div className="text-2xl font-bold">{formatCurrency(financialData?.totalRevenue || 0)}</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-green-600 font-medium">
                                    <ArrowUpRight className="h-4 w-4" />
                                    <span>{financialData?.collectionRate ? financialData?.collectionRate.toFixed(1) + "% Recouvrés" : "..."}</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden border-l-4 border-l-purple-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('decision.retentionRate', 'Taux de Réussite')}</CardTitle>
                                <div className="text-2xl font-bold">{academicOverall?.overallSuccessRate ? academicOverall.overallSuccessRate.toFixed(1) + "%" : "0%"}</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-green-600 font-medium">
                                    <ArrowUpRight className="h-4 w-4" />
                                    <span>Globalité de l'établissement</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden border-l-4 border-l-orange-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('decision.academicAlert', 'Alerte Académique')}</CardTitle>
                                <div className="text-2xl font-bold">{failingStudentsCount} {failingStudentsCount > 1 ? StudentsLabel.toLowerCase() : studentLabel.toLowerCase()}</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-orange-600 font-medium font-bold">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>{t('decision.criticalRiskLevel', 'Niveau de risque critique')}</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden border-l-4 border-l-emerald-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('decision.efficiencyScore', "Score d'Efficacité")}</CardTitle>
                                <div className="text-2xl font-bold">{efficiencyScore}/10</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-emerald-600 font-medium">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>{t('decision.optimalPerformance', 'Performance optimale')}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                        <Card className="lg:col-span-4 shadow-lg border-primary/10">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle>{t('decision.performanceTrends', 'Tendances de Performance')}</CardTitle>
                                        <CardDescription>{t('decision.performanceCorrelation', 'Corrélation entre performance académique et financière')}</CardDescription>
                                    </div>
                                    <Badge variant="secondary" className="bg-primary/5 text-primary">{t('decision.iaInsights', 'IA Insights activés')}</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={revenueTrend}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="oklch(var(--p))" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="oklch(var(--p))" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(var(--b3))" />
                                        <XAxis dataKey="month" stroke="oklch(var(--bc))" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="oklch(var(--bc))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value / 1000}k`} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'oklch(var(--b1))',
                                                border: '1px solid oklch(var(--b3))',
                                                borderRadius: '8px'
                                            }}
                                        />
                                        <Area type="monotone" dataKey="amount" stroke="oklch(var(--p))" fillOpacity={1} fill="url(#colorRevenue)" strokeWidth={3} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="lg:col-span-3 shadow-lg border-primary/10">
                            <CardHeader>
                                <CardTitle>{t('decision.support', 'Aide à la Décision')}</CardTitle>
                                <CardDescription>{t('decision.recommendedActions', 'Actions recommandées basées sur les données actuelles')}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 flex gap-4 items-start">
                                        <div className="bg-orange-500 p-2 rounded-lg text-white">
                                            <TrendingDown className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-orange-900">{t('decision.recoveryIntervention', 'Intervention de Recouvrement')}</p>
                                            <p className="text-sm text-orange-700 mt-1">
                                                {t('decision.recoveryInterventionDesc', {
                                                    defaultValue: "Augmenter les relances de facturation en {{level}}. Les factures impayées ont atteint 25% ce mois.",
                                                    level: isUniversity ? "Licence 1" : "CM2"
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 flex gap-4 items-start">
                                        <div className="bg-blue-500 p-2 rounded-lg text-white">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-blue-900">{t('decision.academicSupport', 'Soutien Académique')}</p>
                                            <p className="text-sm text-blue-700 mt-1">
                                                {t('decision.academicSupportDesc', {
                                                    defaultValue: "La performance en {{subject}} a chuté de 15% lors de la dernière évaluation.",
                                                    subject: isUniversity ? (t('subjects.algo', 'Algorithmique')) : (t('subjects.math', 'Mathématiques'))
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex gap-4 items-start">
                                        <div className="bg-emerald-500 p-2 rounded-lg text-white">
                                            <TrendingUp className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-emerald-900">{t('decision.operationalExcellence', 'Excellence Opérationnelle')}</p>
                                            <p className="text-sm text-emerald-700 mt-1">
                                                {t('decision.operationalExcellenceDesc', "L'assiduité des enseignants est à son plus haut niveau historique (98%). Envisagez une prime de reconnaissance.")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    className="w-full mt-6 bg-primary/10 text-primary hover:bg-primary/20 border-none"
                                    onClick={() => toast.info(t('decision.generatingReport', 'Génération du rapport complet...'))}
                                >
                                    {t('decision.viewFullReport', 'Voir le Rapport Complet d\'Analyse')}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Academic Risks */}
                <TabsContent value="academic" className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>{t('decision.successHeatmap', 'Heatmap de Réussite')}</CardTitle>
                                <CardDescription>{t('decision.successHeatmapDesc', {
                                    defaultValue: 'Vision comparative des taux de réussite par {{level}}',
                                    level: levelLabel.toLowerCase()
                                })}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={successByClass} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="oklch(var(--b3))" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" stroke="oklch(var(--bc))" fontSize={12} width={100} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            cursor={{ fill: 'oklch(var(--b2))' }}
                                            contentStyle={{
                                                backgroundColor: 'oklch(var(--b1))',
                                                border: '1px solid oklch(var(--b3))',
                                                borderRadius: '8px'
                                            }}
                                        />
                                        <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                                            {(successByClass || []).map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={entry.rate > 80 ? 'oklch(var(--su))' : entry.rate > 60 ? 'oklch(var(--wa))' : 'oklch(var(--er))'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>{t('decision.riskDistribution', 'Distribution des Risques')}</CardTitle>
                                <CardDescription>{t('decision.riskDistributionDesc', {
                                    defaultValue: 'Ségmentation des {{students}} par niveau de fragilité',
                                    students: studentsLabel.toLowerCase()
                                })}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: t('common.risk.critical', 'Critique (Renvoyés)'), value: academicOverall?.failingStudents || 5, color: '#ef4444' },
                                                { name: t('common.risk.high', 'Élevé (Passables)'), value: Math.floor((academicOverall?.totalStudents || 20) * 0.2), color: '#f97316' },
                                                { name: t('common.risk.moderate', 'Modéré (Moyens)'), value: Math.floor((academicOverall?.totalStudents || 20) * 0.4), color: '#eab308' },
                                                { name: t('common.risk.low', 'Faible (Excellents)'), value: Math.floor((academicOverall?.totalStudents || 20) * 0.3), color: '#22c55e' },
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={80}
                                            outerRadius={120}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {['#ef4444', '#f97316', '#eab308', '#22c55e'].map((color, index) => (
                                                <Cell key={`cell-${index}`} fill={color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="financial" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <Card className="relative overflow-hidden border-l-4 border-l-green-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('financial.revenue', 'Revenu Total')}</CardTitle>
                                <div className="text-2xl font-bold">{formatCurrency(financialData?.totalRevenue || 0)}</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-green-600 font-medium">
                                    <ArrowUpRight className="h-4 w-4" />
                                    <span>+12.5% vs an dernier</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden border-l-4 border-l-blue-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('financial.collectionRate', 'Taux de Recouvrement')}</CardTitle>
                                <div className="text-2xl font-bold">{financialData?.collectionRate || 0}%</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-blue-600 font-medium">
                                    <TrendingUp className="h-4 w-4" />
                                    <span>{formatCurrency(financialData?.paidRevenue || 0)} encaissés</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden border-l-4 border-l-orange-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('financial.pendingBills', 'Paiements en Attente')}</CardTitle>
                                <div className="text-2xl font-bold">{formatCurrency(financialData?.pendingRevenue || 0)}</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-orange-600 font-medium">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>Attention aux impayés</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden border-l-4 border-l-indigo-500 shadow-md">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{t('financial.activeScholarships', 'Bourses & Réductions')}</CardTitle>
                                <div className="text-2xl font-bold">14.2k €</div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center text-xs text-indigo-600 font-medium">
                                    <GraduationCap className="h-4 w-4" />
                                    <span>12 bénéficiaires actifs</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>{t('financial.cashFlow', 'Evolution des Revenus')}</CardTitle>
                                <CardDescription>{t('financial.cashFlowDesc', 'Tendance mensuelle des encaissements et prévisions')}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={revenueTrend || []}>
                                        <defs>
                                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="oklch(var(--p))" stopOpacity={0.1}/>
                                                <stop offset="95%" stopColor="oklch(var(--p))" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="oklch(var(--b3))" />
                                        <XAxis dataKey="period" stroke="oklch(var(--bc))" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="oklch(var(--bc))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}€`} />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: 'oklch(var(--b2))', 
                                                border: '1px solid oklch(var(--b3))', 
                                                borderRadius: '8px',
                                                color: 'oklch(var(--bc))'
                                            }}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="revenue" 
                                            stroke="oklch(var(--p))" 
                                            fillOpacity={1} 
                                            fill="url(#colorRevenue)" 
                                            strokeWidth={3}
                                            name="Revenu Total"
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="paid" 
                                            stroke="oklch(var(--su))" 
                                            fill="transparent" 
                                            strokeWidth={2}
                                            name="Encaissé"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>{t('financial.revenueDistribution', 'Encours par Classe')}</CardTitle>
                                <CardDescription>{t('financial.revenueDistributionDesc', 'Répartition des sommes restant à percevoir')}</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={financialData?.outstandingByClass?.map((c: any) => ({ name: c.class_name, value: c.outstanding_amount })) || []}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={80}
                                            outerRadius={120}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {(financialData?.outstandingByClass || []).map((_entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 5]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};
