import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, BookOpen, TrendingUp, TrendingDown } from "lucide-react";

interface AnalyticsSecondaryStatsProps {
    teacherCount: number;
    classroomCount: number;
    collectedRevenue: number;
    pendingRevenue: number;
    formatCurrency: (amount: number) => string;
}

export const AnalyticsSecondaryStats = ({
    teacherCount,
    classroomCount,
    collectedRevenue,
    pendingRevenue,
    formatCurrency
}: AnalyticsSecondaryStatsProps) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-muted/30 border-none">
                <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                        <GraduationCap className="w-5 h-5 text-muted-foreground" />
                        <div>
                            <p className="text-lg font-semibold">{teacherCount || 0}</p>
                            <p className="text-xs text-muted-foreground">Enseignants</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-muted/30 border-none">
                <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-muted-foreground" />
                        <div>
                            <p className="text-lg font-semibold">{classroomCount || 0}</p>
                            <p className="text-xs text-muted-foreground">Classes</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-muted/30 border-none">
                <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        <div>
                            <p className="text-lg font-semibold">{formatCurrency(collectedRevenue || 0)}</p>
                            <p className="text-xs text-muted-foreground">Encaissé</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-muted/30 border-none">
                <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                        <TrendingDown className="w-5 h-5 text-red-600" />
                        <div>
                            <p className="text-lg font-semibold">{formatCurrency(pendingRevenue || 0)}</p>
                            <p className="text-xs text-muted-foreground">En attente</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
