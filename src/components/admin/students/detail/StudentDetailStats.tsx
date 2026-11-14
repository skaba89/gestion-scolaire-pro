import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, ClipboardCheck, BookOpen, CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-4 text-center">
                    <GraduationCap className="h-8 w-8 mx-auto text-primary mb-2" />
                    <p className="text-2xl font-bold">{gradeAverage}/20</p>
                    <p className="text-sm text-muted-foreground">{t("studentsAdmin.moyenneGenerale")}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-4 text-center">
                    <ClipboardCheck className="h-8 w-8 mx-auto text-green-500 mb-2" />
                    <p className="text-2xl font-bold">{attendanceRate}%</p>
                    <p className="text-sm text-muted-foreground">{t("studentsAdmin.tauxDePresence")}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-4 text-center">
                    <BookOpen className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                    <p className="text-2xl font-bold">{evaluationCount}</p>
                    <p className="text-sm text-muted-foreground">{t("studentsAdmin.evaluations")}</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-4 text-center">
                    <CreditCard className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                    <p className="text-2xl font-bold">{paidInvoicesCount}/{totalInvoicesCount}</p>
                    <p className="text-sm text-muted-foreground">{t("studentsAdmin.facturesPayees")}</p>
                </CardContent>
            </Card>
        </div>
    );
}
