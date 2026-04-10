import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Award, FileText } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";

interface Grade {
    id: string;
    score: number;
    assessments: {
        name: string;
        max_score: number;
        subjects: { name: string };
    };
}

interface StudentRecentGradesProps {
    grades: Grade[];
    getTenantUrl: (path: string) => string;
}

export const StudentRecentGrades = ({ grades, getTenantUrl }: StudentRecentGradesProps) => {
    return (
        <Card className="lg:col-span-2">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-display">
                        <Award className="w-5 h-5 text-primary" />
                        Dernières Notes
                    </CardTitle>
                    <Link to={getTenantUrl("/student/grades")} className="text-sm text-primary hover:underline font-medium">
                        Voir tout
                    </Link>
                </div>
            </CardHeader>
            <CardContent>
                {grades.length === 0 ? (
                    <div className="text-center py-8">
                        <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">Aucune note récente</p>
                    </div>
                ) : (
                    <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                        {grades.map((grade, idx) => {
                            const percentage = (grade.score / grade.assessments.max_score) * 100;
                            const isGood = percentage >= 50;

                            return (
                                <StaggerItem key={grade.id} index={idx}>
                                    <div
                                        className={`p-4 rounded-xl border transition-all duration-200 hover:shadow-sm ${isGood ? "border-green-100 bg-green-50/30" : "border-red-100 bg-red-50/30"
                                            }`}
                                    >
                                        <p className="text-sm font-semibold truncate mb-1">
                                            {grade.assessments.subjects.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate mb-2">
                                            {grade.assessments.name}
                                        </p>
                                        <p className={`text-2xl font-bold ${isGood ? "text-green-600" : "text-red-600"}`}>
                                            {grade.score}
                                            <span className="text-sm font-normal text-muted-foreground ml-1">
                                                /{grade.assessments.max_score}
                                            </span>
                                        </p>
                                    </div>
                                </StaggerItem>
                            );
                        })}
                    </StaggerContainer>
                )}
            </CardContent>
        </Card>
    );
};
