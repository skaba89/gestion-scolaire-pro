import { useTranslation } from "react-i18next";
import { BarChart3, PieChart } from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart as RechartsPieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentRisk } from "@/types/ai";

interface AIChartsProps {
    studentRisks: StudentRisk[];
}

/**
 * Graphiques construits UNIQUEMENT sur les élèves signalés par l'API
 * (moyenne < 60 % du barème). Retirés (audit 2026-11-02, SIM-AI-01) : le
 * radar dont deux axes étaient tirés au hasard et la comparaison par classe,
 * toujours vide (l'API ne fournit pas la classe).
 */
export function AICharts({ studentRisks }: AIChartsProps) {
    const { t } = useTranslation();

    const byLevel = [
        { name: t("aiInsights.charts.levelHigh"), value: studentRisks.filter((s) => s.riskLevel === "high").length, fill: "hsl(0, 84%, 60%)" },
        { name: t("aiInsights.charts.levelMedium"), value: studentRisks.filter((s) => s.riskLevel === "medium").length, fill: "hsl(45, 93%, 47%)" },
    ].filter((d) => d.value > 0);

    // Tranches sur 20 (les moyennes de l'API sont sur 20, pas en pourcentage).
    const bands = [
        { name: "< 6", min: -Infinity, max: 6 },
        { name: "6 – 8", min: 6, max: 8 },
        { name: "8 – 10", min: 8, max: 10 },
        { name: "≥ 10", min: 10, max: Infinity },
    ].map((b) => ({
        name: b.name,
        students: studentRisks.filter((s) => s.avgGrade >= b.min && s.avgGrade < b.max).length,
    }));

    if (studentRisks.length === 0) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-muted-foreground">{t("aiInsights.charts.empty")}</CardContent>
            </Card>
        );
    }

    return (
        <div className="grid md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PieChart className="h-5 w-5" aria-hidden="true" />
                        {t("aiInsights.charts.levelsTitle")}
                    </CardTitle>
                    <CardDescription>{t("aiInsights.charts.levelsDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                                <Pie data={byLevel} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value" label>
                                    {byLevel.map((entry) => (
                                        <Cell key={entry.name} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </RechartsPieChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" aria-hidden="true" />
                        {t("aiInsights.charts.bandsTitle")}
                    </CardTitle>
                    <CardDescription>{t("aiInsights.charts.bandsDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={bands}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                                <Tooltip />
                                <Bar dataKey="students" name={t("aiInsights.charts.studentsSeries")} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
