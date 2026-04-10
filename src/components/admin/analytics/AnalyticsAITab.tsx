import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { BrainCircuit, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { useStudentLabel } from "@/hooks/useStudentLabel";

const RISK_COLORS: Record<string, string> = {
    critical: "#ef4444", // red-500
    high: "#f97316",     // orange-500
    moderate: "#eab308", // yellow-500
    low: "#22c55e",      // green-500
};

export const AnalyticsAITab = () => {
    const { tenant } = useTenant();
    const { studentLabel, studentsLabel, StudentLabel, StudentsLabel } = useStudentLabel();
    const queryClient = useQueryClient();
    const [isCalculating, setIsCalculating] = useState(false);

    // Fetch AI proxy/Risk Scores
    const { data: riskData, isLoading, refetch } = useQuery({
        queryKey: ["ai-risk-scores", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return { students: [], summary: {} };
            const { data } = await apiClient.get('/analytics/students-at-risk');
            return data;
        },
        enabled: !!tenant?.id,
    });

    const handleRecalculate = async () => {
        setIsCalculating(true);
        try {
            await refetch();
            toast.success("Analyse IA terminée avec succès");
        } catch (error: any) {
            toast.error("Échec de l'analyse IA: " + error.message);
        } finally {
            setIsCalculating(false);
        }
    };

    const riskScores = riskData?.students || [];
    const summary = riskData?.summary || { critical: 0, high: 0, moderate: 0, low: 0 };

    // Process data for chart
    const distributionData = [
        { name: "Critique", value: summary.critical, level: "critical" },
        { name: "Élevé", value: summary.high, level: "high" },
        { name: "Modéré", value: summary.moderate, level: "moderate" },
        { name: "Faible", value: summary.low, level: "low" },
    ].filter(d => d.value > 0);

    const atRiskStudents = riskScores.filter((s: any) => ["critical", "high"].includes(s.risk_level));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="space-y-1">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5 text-primary" />
                        Analyse Prédictive IA
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Identification proactive des {studentsLabel.toLowerCase()} en difficulté basée sur les performances, l'assiduité et le comportement.
                    </p>
                </div>
                <Button
                    onClick={handleRecalculate}
                    disabled={isCalculating || isLoading}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isCalculating ? "animate-spin" : ""}`} />
                    {isCalculating ? "Calcul en cours..." : "Recalculer les scores"}
                </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Risk Distribution Chart */}
                <Card className="lg:col-span-1 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold">Répartition des Risques</CardTitle>
                        <CardDescription>Vue d'ensemble du niveau d'alerte global</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-64">
                            {distributionData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={distributionData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {distributionData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={RISK_COLORS[entry.level]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                                    <span className="italic">Aucun score calculé</span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* List of high risk students */}
                <Card className="lg:col-span-2 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-destructive" />
                            {StudentsLabel} avec Alerte Critique ou Élevée
                        </CardTitle>
                        <CardDescription>Actions recommandées pour les profils prioritaires</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead>{StudentLabel}</TableHead>
                                        <TableHead>Niveau de Risque</TableHead>
                                        <TableHead className="text-center">Moyenne</TableHead>
                                        <TableHead>Analyse Synthétique</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {atRiskStudents.length > 0 ? (
                                        atRiskStudents.map((score: any) => (
                                            <TableRow key={score.student_id}>
                                                <TableCell>
                                                    <div className="font-medium">{score.first_name} {score.last_name}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant="secondary"
                                                        style={{
                                                            backgroundColor: `${RISK_COLORS[score.risk_level]}20`,
                                                            color: RISK_COLORS[score.risk_level]
                                                        }}
                                                    >
                                                        {score.risk_level.toUpperCase()}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center font-bold">
                                                    {score.avg_grade}/20 ({score.grade_count} notes)
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs space-y-1 text-muted-foreground italic">
                                                        L'IA détecte une moyenne globale faible ({score.avg_grade}). Un entretien pédagogique est conseillé pour comprendre les difficultés rencontrées en cours.
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                                Aucun élève à haut risque identifié.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
