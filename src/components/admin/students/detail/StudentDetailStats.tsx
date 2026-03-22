import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, ClipboardCheck, BookOpen, CreditCard } from "lucide-react";

interface StudentDetailStatsProps {
    gradeAverage: string | number;
    attendanceRate: number;
    evaluationCount: number;
    paidInvoicesCount: number;
    totalInvoicesCount: number;
}

export function StudentDetailStats({
    gradeAverage,
    attendanceRate,
    evaluationCount,
    paidInvoicesCount,
    totalInvoicesCount
}: StudentDetailStatsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-4 text-center">
                    <GraduationCap className="h-8 w-8 mx-auto text-primary mb-2" />
                    <p className="text-2xl font-bold">{gradeAverage}/20</p>
                    <p className="text-sm text-muted-foreground">Moyenne Générale</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-4 text-center">
                    <ClipboardCheck className="h-8 w-8 mx-auto text-green-500 mb-2" />
                    <p className="text-2xl font-bold">{attendanceRate}%</p>
                    <p className="text-sm text-muted-foreground">Taux de Présence</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-4 text-center">
                    <BookOpen className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                    <p className="text-2xl font-bold">{evaluationCount}</p>
                    <p className="text-sm text-muted-foreground">Évaluations</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-4 text-center">
                    <CreditCard className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                    <p className="text-2xl font-bold">{paidInvoicesCount}/{totalInvoicesCount}</p>
                    <p className="text-sm text-muted-foreground">Factures Payées</p>
                </CardContent>
            </Card>
        </div>
    );
}
