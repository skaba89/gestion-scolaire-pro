import { useMemo } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, Users, Award, AlertCircle } from "lucide-react";

interface PerformanceAnalyticsProps {
    students: any[];
    studentGrades: Map<string, any[]>;
    termName: string;
}

export const PerformanceAnalytics = ({ students, studentGrades, termName }: PerformanceAnalyticsProps) => {
    // Calculate statistics
    const stats = useMemo(() => {
        let totalAverage = 0;
        let studentCount = 0;
        let passingCount = 0;
        const gradesList: number[] = [];

        students.forEach((student) => {
            const grades = studentGrades.get(student.id) || [];
            if (grades.length > 0) {
                let points = 0;
                let coeffs = 0;
                grades.forEach((g) => {
                    if (g.score !== null) {
                        const normScore = (g.score / g.max_score) * 20;
                        points += normScore * g.coefficient;
                        coeffs += g.coefficient;
                    }
                });

                if (coeffs > 0) {
                    const avg = points / coeffs;
                    totalAverage += avg;
                    studentCount++;
                    gradesList.push(avg);
                    if (avg >= 10) passingCount++;
                }
            }
        });

        const average = studentCount > 0 ? totalAverage / studentCount : 0;
        const sortedGrades = [...gradesList].sort((a, b) => a - b);
        const min = sortedGrades.length > 0 ? sortedGrades[0] : 0;
        const max = sortedGrades.length > 0 ? sortedGrades[sortedGrades.length - 1] : 0;
        const median = sortedGrades.length > 0 ? sortedGrades[Math.floor(sortedGrades.length / 2)] : 0;
        const successRate = studentCount > 0 ? (passingCount / studentCount) * 100 : 0;

        return { average, min, max, median, successRate, studentCount };
    }, [students, studentGrades]);

    // Distribution Data
    const distributionData = useMemo(() => {
        const buckets = [
            { name: "0-5", count: 0, fill: "#ef4444" },
            { name: "5-10", count: 0, fill: "#f97316" },
            { name: "10-12", count: 0, fill: "#eab308" },
            { name: "12-14", count: 0, fill: "#84cc16" },
            { name: "14-16", count: 0, fill: "#22c55e" },
            { name: "16-18", count: 0, fill: "#14b8a6" },
            { name: "18-20", count: 0, fill: "#06b6d4" },
        ];

        students.forEach((student) => {
            const grades = studentGrades.get(student.id) || [];
            // Calculate avg (duplicate logic, ideally refactor)
            let points = 0, coeffs = 0;
            grades.forEach(g => {
                if (g.score !== null) {
                    points += (g.score / g.max_score) * 20 * g.coefficient;
                    coeffs += g.coefficient;
                }
            });
            if (coeffs > 0) {
                const avg = points / coeffs;
                if (avg < 5) buckets[0].count++;
                else if (avg < 10) buckets[1].count++;
                else if (avg < 12) buckets[2].count++;
                else if (avg < 14) buckets[3].count++;
                else if (avg < 16) buckets[4].count++;
                else if (avg < 18) buckets[5].count++;
                else buckets[6].count++;
            }
        });
        return buckets;
    }, [students, studentGrades]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{stats.average.toFixed(2)}/20</p>
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
                            <p className="text-2xl font-bold">{stats.successRate.toFixed(0)}%</p>
                            <p className="text-sm text-muted-foreground">Taux de réussite</p>
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
                            <p className="text-sm text-muted-foreground">Note maximale</p>
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
                                <BarChart data={distributionData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                        {distributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
                {/* Placeholder for evolution or subject comparison */}
                <Card>
                    <CardHeader>
                        <CardTitle>Performance par matière</CardTitle>
                        <CardDescription>Comparaison des moyennes de classe</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={useMemo(() => {
                                        const topicMap = new Map<string, { sum: number; count: number; max: number }>();

                                        students.forEach((student) => {
                                            const grades = studentGrades.get(student.id) || [];
                                            grades.forEach((g) => {
                                                if (g.score !== null) {
                                                    const normScore = (g.score / g.max_score) * 20;
                                                    const current = topicMap.get(g.subject_name) || { sum: 0, count: 0, max: 0 };
                                                    topicMap.set(g.subject_name, {
                                                        sum: current.sum + normScore,
                                                        count: current.count + 1,
                                                        max: Math.max(current.max, normScore)
                                                    });
                                                }
                                            });
                                        });

                                        return Array.from(topicMap.entries())
                                            .map(([subject, data]) => ({
                                                subject,
                                                moyenne: parseFloat((data.sum / data.count).toFixed(2)),
                                                max: parseFloat(data.max.toFixed(2))
                                            }))
                                            .sort((a, b) => b.moyenne - a.moyenne)
                                            .slice(0, 10); // Limit to top 10 subjects to avoid overcrowding
                                    }, [students, studentGrades])}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                    <XAxis type="number" domain={[0, 20]} />
                                    <YAxis dataKey="subject" type="category" width={100} tick={{ fontSize: 12 }} />
                                    <Tooltip />
                                    <Bar dataKey="moyenne" name="Moyenne Classe" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                                    <Bar dataKey="max" name="Meilleure Note" fill="#10b981" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
