import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
import { useTranslation } from "react-i18next";

interface AnalyticsSubjectsTabProps {
    subjectPerformance: any[];
}

export const AnalyticsSubjectsTab = ({ subjectPerformance }: AnalyticsSubjectsTabProps) => {
    const { t } = useTranslation();
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("parentPortal.subjectsTab.title")}</CardTitle>
                <CardDescription>{t("parentPortal.subjectsTab.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={subjectPerformance}>
                                <PolarGrid />
                                <PolarAngleAxis dataKey="subject" />
                                <PolarRadiusAxis domain={[0, 20]} />
                                <Radar
                                    name="Score"
                                    dataKey="score"
                                    stroke="hsl(var(--primary))"
                                    fill="hsl(var(--primary))"
                                    fillOpacity={0.5}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-3 content-start">
                        {subjectPerformance.sort((a, b) => b.score - a.score).map((subject: any) => (
                            <div key={subject.subject} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <span className="text-sm font-medium truncate">{subject.subject}</span>
                                <Badge variant={subject.score >= 14 ? "default" : subject.score >= 10 ? "secondary" : "destructive"}>
                                    {subject.score.toFixed(1)}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
