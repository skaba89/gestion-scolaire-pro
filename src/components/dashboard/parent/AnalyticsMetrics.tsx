import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Calendar, BookOpen, Target, Award } from "lucide-react";

interface AnalyticsMetricsProps {
    overallStats: {
        overallAverage: number;
        attendanceRate: number;
        homeworkCompletionRate: number;
        trend: number;
        totalPoints: number;
        achievementsCount: number;
        rareAchievementsCount: number;
    };
}

export const AnalyticsMetrics = ({ overallStats }: AnalyticsMetricsProps) => {
    const {
        overallAverage,
        attendanceRate,
        homeworkCompletionRate,
        trend,
        totalPoints,
        achievementsCount,
        rareAchievementsCount
    } = overallStats;

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Moyenne générale</p>
                            <p className="text-3xl font-bold">{overallAverage.toFixed(1)}/20</p>
                        </div>
                        <div className={`p-3 rounded-full ${trend >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                            {trend >= 0 ? (
                                <TrendingUp className="h-6 w-6 text-success" />
                            ) : (
                                <TrendingDown className="h-6 w-6 text-destructive" />
                            )}
                        </div>
                    </div>
                    <p className={`text-sm mt-2 ${trend >= 0 ? "text-success" : "text-destructive"}`}>
                        {trend >= 0 ? "+" : ""}{trend.toFixed(1)} pts ce mois
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Assiduité</p>
                            <p className="text-3xl font-bold">{attendanceRate}%</p>
                        </div>
                        <div className={`p-3 rounded-full ${attendanceRate >= 90 ? "bg-success/10" : attendanceRate >= 75 ? "bg-warning/10" : "bg-destructive/10"}`}>
                            <Calendar className={`h-6 w-6 ${attendanceRate >= 90 ? "text-success" : attendanceRate >= 75 ? "text-warning" : "text-destructive"}`} />
                        </div>
                    </div>
                    <Progress value={attendanceRate} className="mt-2" />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Devoirs rendus</p>
                            <p className="text-3xl font-bold">{homeworkCompletionRate}%</p>
                        </div>
                        <div className={`p-3 rounded-full ${homeworkCompletionRate >= 90 ? "bg-success/10" : "bg-warning/10"}`}>
                            <BookOpen className={`h-6 w-6 ${homeworkCompletionRate >= 90 ? "text-success" : "text-warning"}`} />
                        </div>
                    </div>
                    <Progress value={homeworkCompletionRate} className="mt-2" />
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Points gagnés</p>
                            <p className="text-3xl font-bold">{totalPoints}</p>
                        </div>
                        <div className="p-3 rounded-full bg-primary/10">
                            <Target className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                        Points accumulés
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Badges</p>
                            <p className="text-3xl font-bold">{achievementsCount}</p>
                        </div>
                        <div className="p-3 rounded-full bg-warning/10">
                            <Award className="h-6 w-6 text-warning" />
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                        {rareAchievementsCount} rares
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};
