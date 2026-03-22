import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, BarChart3, Target, Calendar } from "lucide-react";

interface SurveyStatsProps {
    activeCount: number;
    totalResponses: number;
    totalSurveys: number;
}

export const SurveyStats = ({
    activeCount,
    totalResponses,
    totalSurveys,
}: SurveyStatsProps) => {
    const participationRate = totalSurveys ? Math.round((totalResponses / (totalSurveys * 100)) * 100) : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Sondages actifs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{activeCount}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Total réponses
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{totalResponses}</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Taux participation
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {participationRate}%
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Total sondages
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalSurveys}</div>
                </CardContent>
            </Card>
        </div>
    );
};
