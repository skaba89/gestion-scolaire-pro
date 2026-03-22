import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, Award, DollarSign } from "lucide-react";

interface AnalyticsKPIsProps {
    totalStudents: number;
    attendanceRate: number;
    avgGrade: string | number;
    collectionRate: number;
    studentsLabel: string;
}

export const AnalyticsKPIs = ({
    totalStudents,
    attendanceRate,
    avgGrade,
    collectionRate,
    studentsLabel
}: AnalyticsKPIsProps) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">{studentsLabel} inscrits</p>
                            <p className="text-2xl font-bold">{totalStudents || 0}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-primary/10">
                            <Users className="w-5 h-5 text-primary" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Taux de présence</p>
                            <p className="text-2xl font-bold">{attendanceRate || 0}%</p>
                        </div>
                        <div className="p-3 rounded-lg bg-green-500/10">
                            <UserCheck className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Moyenne générale</p>
                            <p className="text-2xl font-bold">{avgGrade || "—"}/20</p>
                        </div>
                        <div className="p-3 rounded-lg bg-blue-500/10">
                            <Award className="w-5 h-5 text-blue-600" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Taux recouvrement</p>
                            <p className="text-2xl font-bold">{collectionRate || 0}%</p>
                        </div>
                        <div className="p-3 rounded-lg bg-amber-500/10">
                            <DollarSign className="w-5 h-5 text-amber-600" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
