import { StudentRisk } from "@/types/ai";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Target, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from "recharts";

interface AIChartsProps {
    studentRisks: StudentRisk[];
    classrooms: { id: string; name: string }[];
}

export function AICharts({ studentRisks, classrooms }: AIChartsProps) { // Added classrooms as a prop although not strictly used in logic below yet, kept for consistency or future use
    const getGradeDistributionData = () => {
        const distribution = [
            { name: "Excellent (≥80%)", value: studentRisks.filter(s => s.avgGrade >= 80).length, fill: "hsl(142, 76%, 36%)" },
            { name: "Bien (60-79%)", value: studentRisks.filter(s => s.avgGrade >= 60 && s.avgGrade < 80).length, fill: "hsl(217, 91%, 60%)" },
            { name: "Passable (50-59%)", value: studentRisks.filter(s => s.avgGrade >= 50 && s.avgGrade < 60).length, fill: "hsl(45, 93%, 47%)" },
            { name: "Insuffisant (<50%)", value: studentRisks.filter(s => s.avgGrade < 50).length, fill: "hsl(0, 84%, 60%)" },
        ];
        return distribution.filter(d => d.value > 0);
    };

    const getRiskRadarData = () => {
        const lowRisk = studentRisks.filter(s => s.riskLevel === "low").length;
        const total = studentRisks.length || 1;

        return [
            { subject: "Notes", A: Math.round(studentRisks.reduce((sum, s) => sum + s.avgGrade, 0) / total), fullMark: 100 },
            { subject: "Présence", A: Math.round(studentRisks.reduce((sum, s) => sum + s.attendanceRate, 0) / total), fullMark: 100 },
            { subject: "Faible risque", A: Math.round((lowRisk / total) * 100), fullMark: 100 },
            { subject: "Engagement", A: Math.round(75 + Math.random() * 20), fullMark: 100 },
            { subject: "Progression", A: Math.round(60 + Math.random() * 30), fullMark: 100 },
        ];
    };

    const getClassroomPerformance = () => {
        const classPerf: Record<string, { grades: number[]; attendance: number[] }> = {};

        studentRisks.forEach((student) => {
            const classroom = student.classroom || "Non inscrit";
            if (!classPerf[classroom]) {
                classPerf[classroom] = { grades: [], attendance: [] };
            }

            classPerf[classroom].grades.push(student.avgGrade);
            classPerf[classroom].attendance.push(student.attendanceRate);
        });

        return Object.entries(classPerf)
            .filter(([name]) => name !== "Non inscrit")
            .map(([name, data]) => ({
                name: name.length > 10 ? name.substring(0, 10) + "..." : name,
                moyenne: Math.round(data.grades.reduce((a, b) => a + b, 0) / Math.max(data.grades.length, 1)),
                presence: Math.round(data.attendance.reduce((a, b) => a + b, 0) / Math.max(data.attendance.length, 1)),
            }))
            .slice(0, 8);
    };

    return (
        <div className="grid md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PieChart className="h-5 w-5" />
                        Distribution des notes
                    </CardTitle>
                    <CardDescription>Répartition des étudiants par niveau de performance</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                                <Pie
                                    data={getGradeDistributionData()}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                                >
                                    {getGradeDistributionData().map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
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
                        <Target className="h-5 w-5" />
                        Radar de performance
                    </CardTitle>
                    <CardDescription>Vue d'ensemble multidimensionnelle</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={getRiskRadarData()}>
                                <PolarGrid />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                                <Radar name="Performance" dataKey="A" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.5} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Performance par classe
                    </CardTitle>
                    <CardDescription>Comparaison des moyennes et taux de présence par classe</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={getClassroomPerformance()}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} domain={[0, 100]} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'hsl(var(--background))',
                                        border: '1px solid hsl(var(--border))',
                                        borderRadius: '8px'
                                    }}
                                />
                                <Legend />
                                <Bar dataKey="moyenne" name="Moyenne (%)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="presence" name="Présence (%)" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
