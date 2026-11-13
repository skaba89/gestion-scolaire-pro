import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface GradeRecord {
    id: string;
    score: number | null;
    comment: string | null;
    assessments: {
        name: string;
        max_score: number;
        type: string;
        date: string;
        subjects: {
            name: string;
            code: string | null;
        };
    };
}

interface StudentGradeTableProps {
    grades: any[];
}

export const StudentGradeTable = ({ grades }: StudentGradeTableProps) => {
    const { t } = useTranslation();
    return (
        <Card className="border-primary/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-lg font-display">{t("studentPortal.gradeTable.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {grades.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        {t("studentPortal.gradeTable.none")}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="font-semibold px-6">{t("studentPortal.gradeTable.subject")}</TableHead>
                                <TableHead className="font-semibold">{t("studentPortal.gradeTable.assessment")}</TableHead>
                                <TableHead className="font-semibold">{t("studentPortal.gradeTable.type")}</TableHead>
                                <TableHead className="font-semibold">{t("studentPortal.gradeTable.date")}</TableHead>
                                <TableHead className="text-right font-semibold px-6">{t("studentPortal.gradeTable.grade")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {grades.map((grade) => {
                                const percentage = (grade.score / grade.assessments.max_score) * 100;
                                const isGood = percentage >= 50;

                                return (
                                    <TableRow key={grade.id} className="hover:bg-muted/30 transition-colors">
                                        <TableCell className="font-medium px-6 py-4">
                                            {grade.assessments.subjects.name}
                                            {grade.assessments.subjects.code && (
                                                <span className="ml-2 text-xs text-muted-foreground uppercase">
                                                    ({grade.assessments.subjects.code})
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-4">{grade.assessments.name}</TableCell>
                                        <TableCell className="py-4">
                                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-background">
                                                {grade.assessments.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            {grade.assessments.date
                                                ? format(new Date(grade.assessments.date), "dd/MM/yyyy", { locale: dateFnsLocale() })
                                                : "-"}
                                        </TableCell>
                                        <TableCell className="text-right px-6 py-4">
                                            <span className={`text-base font-bold ${isGood ? "text-green-600" : "text-red-600"}`}>
                                                {grade.score !== null ? grade.score : "-"}
                                            </span>
                                            <span className="text-xs text-muted-foreground ml-1">
                                                /{grade.assessments.max_score}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
};
