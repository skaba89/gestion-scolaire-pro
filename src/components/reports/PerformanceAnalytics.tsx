import { useMemo } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, Users, Award, AlertCircle } from "lucide-react";

/**
 * Onglet « Analyse des résultats » de la page Bulletins.
 *
 * Toutes les valeurs viennent de la synthèse officielle de la période
 * (GET /school-life/report-cards/class-summary/), calculée comme le bulletin :
 * moyennes des élèves, seuil de réussite du niveau, statistiques par matière.
 * Auparavant l'onglet recalculait dans le navigateur, sur TOUTES les notes
 * (toutes périodes), note par note, au seuil 10 écrit en dur.
 */

export interface SubjectStat {
    subject_id: string | null;
    subject_name: string;
    coefficient: number;
    class_average: number | null;
    best_average: number | null;
    graded_students: number;
}

interface PerformanceAnalyticsProps {
    /** Moyennes officielles des élèves notés (élèves sans note exclus). */
    averages: number[];
    /** Seuil de réussite effectif du niveau de la classe. */
    passingGrade: number;
    subjects: SubjectStat[];
    termName: string;
}

const BUCKETS = [
    { name: "0-5", min: 0, fill: "#ef4444" },
    { name: "5-10", min: 5, fill: "#f97316" },
    { name: "10-12", min: 10, fill: "#eab308" },
    { name: "12-14", min: 12, fill: "#84cc16" },
    { name: "14-16", min: 14, fill: "#22c55e" },
    { name: "16-18", min: 16, fill: "#14b8a6" },
    { name: "18-20", min: 18, fill: "#06b6d4" },
];

export function computeClassStats(averages: number[], passingGrade: number) {
    const sorted = [...averages].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const median = n === 0 ? 0
        : n % 2 === 1 ? sorted[(n - 1) / 2]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    return {
        studentCount: n,
        average: n ? sum / n : 0,
        min: n ? sorted[0] : 0,
        max: n ? sorted[n - 1] : 0,
        median,
        successRate: n ? (sorted.filter((v) => v >= passingGrade).length / n) * 100 : 0,
        distribution: BUCKETS.map((bucket, i) => ({
            name: bucket.name,
            fill: bucket.fill,
            count: sorted.filter((v) => v >= bucket.min && (i === BUCKETS.length - 1 || v < BUCKETS[i + 1].min)).length,
        })),
    };
}

export const PerformanceAnalytics = ({ averages, passingGrade, subjects, termName }: PerformanceAnalyticsProps) => {
    const stats = useMemo(() => computeClassStats(averages, passingGrade), [averages, passingGrade]);

    const subjectData = useMemo(() => subjects
        .filter((s) => s.class_average !== null)
        .map((s) => ({
            key: s.subject_id ?? s.subject_name,
            subject: s.subject_name,
            moyenne: s.class_average as number,
            max: s.best_average as number,
        }))
        .sort((a, b) => b.moyenne - a.moyenne)
        .slice(0, 10), [subjects]);

    if (stats.studentCount === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                Aucune moyenne calculable pour cette période{termName ? ` (${termName})` : ""}.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold" data-testid="analytics-average">{stats.average.toFixed(2)}/20</p>
                            <p className="text-sm text-muted-foreground">Moyenne générale</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                            <Award className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold" data-testid="analytics-success-rate">{stats.successRate.toFixed(0)}%</p>
                            <p className="text-sm text-muted-foreground">Taux de réussite (≥ {passingGrade}/20)</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.median.toFixed(2)}/20</p>
                            <p className="text-sm text-muted-foreground">Médiane</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-orange-100 text-orange-600 rounded-lg">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.max.toFixed(2)}/20</p>
                            <p className="text-sm text-muted-foreground">Meilleure moyenne</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Distribution des moyennes</CardTitle>
                        <CardDescription>{termName}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.distribution}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip />
                                    <Bar dataKey="count" name="Élèves" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                        {stats.distribution.map((entry) => (
                                            <Cell key={entry.name} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Performance par matière</CardTitle>
                        <CardDescription>Moyennes de classe de la période</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={subjectData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                    <XAxis type="number" domain={[0, 20]} />
                                    <YAxis dataKey="subject" type="category" width={100} tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Bar dataKey="moyenne" name="Moyenne de classe" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                                    <Bar dataKey="max" name="Meilleure moyenne" fill="#10b981" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
