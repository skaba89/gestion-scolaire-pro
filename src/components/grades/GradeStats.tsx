import { BarChart3, BookOpen, Users, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface GradeStatsProps {
    totalAssessments: number;
    totalSubjects: number;
    totalClassrooms: number;
}

export const GradeStats = ({
    totalAssessments,
    totalSubjects,
    totalClassrooms,
}: GradeStatsProps) => {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalAssessments}</p>
                            <p className="text-xs text-muted-foreground">Évaluations</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-secondary-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalSubjects}</p>
                            <p className="text-xs text-muted-foreground">Matières</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center">
                            <Users className="w-5 h-5 text-accent-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalClassrooms}</p>
                            <p className="text-xs text-muted-foreground">Classes</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalClassrooms}</p>
                            <p className="text-xs text-muted-foreground">Classes</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
