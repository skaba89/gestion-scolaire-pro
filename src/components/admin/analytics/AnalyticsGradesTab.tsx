import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { PieChart as PieChartIcon, Target } from "lucide-react";
import { useTranslation } from "react-i18next";

interface GradeDistData {
    range: string;
    count: number;
    fill: string;
}

interface SubjectPerfData {
    name: string;
    moyenne: number;
}

interface AnalyticsGradesTabProps {
    gradesDistribution: GradeDistData[];
    subjectPerformance: SubjectPerfData[];
}

export const AnalyticsGradesTab = ({
    gradesDistribution,
    subjectPerformance
}: AnalyticsGradesTabProps) => {
    const { t } = useTranslation();
    return (
        <div className="grid lg:grid-cols-2 gap-6">
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <PieChartIcon className="w-5 h-5 text-primary" />
                        {t("adminAnalytics.grades.distribution")}
                    </CardTitle>
                    <CardDescription>{t("adminAnalytics.grades.distributionHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-72">
                        {gradesDistribution && gradesDistribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={gradesDistribution}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                                    <XAxis dataKey="range" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "8px",
                                        }}
                                    />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {gradesDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground italic">
                                {t("adminAnalytics.noData")}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Target className="w-5 h-5 text-primary" />
                        {t("adminAnalytics.grades.bySubject")}
                    </CardTitle>
                    <CardDescription>{t("adminAnalytics.grades.bySubjectHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-72">
                        {subjectPerformance && subjectPerformance.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={subjectPerformance} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                                    <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "hsl(var(--card))",
                                            border: "1px solid hsl(var(--border))",
                                            borderRadius: "8px",
                                        }}
                                        formatter={(value: number) => [`${value}/20`, t("adminAnalytics.grades.average")]}
                                    />
                                    <Bar dataKey="moyenne" fill="hsl(217, 91%, 50%)" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-muted-foreground italic">
                                {t("adminAnalytics.noData")}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
