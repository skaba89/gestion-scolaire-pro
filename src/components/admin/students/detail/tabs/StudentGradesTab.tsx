import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { intlLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface Grade {
    id: string;
    score: number | null;
    assessment: {
        name: string;
        max_score: number;
        subject: { name: string };
        term: { name: string };
    };
    created_at: string;
}

interface StudentGradesTabProps {
    grades: Grade[];
    studentLabel: string;
}

export function StudentGradesTab({ grades, studentLabel }: StudentGradesTabProps) {
    const { t } = useTranslation();
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("studentsAdmin.historiqueDesNotes")}</CardTitle>
                <CardDescription>{t("studentsAdmin.toutesLesEvaluationsEtNotes", { studentLabel: studentLabel.toLowerCase() })}</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("studentsAdmin.matiere")}</TableHead>
                            <TableHead>{t("studentsAdmin.evaluation")}</TableHead>
                            <TableHead>{t("studentsAdmin.trimestre")}</TableHead>
                            <TableHead>{t("studentsAdmin.note")}</TableHead>
                            <TableHead>{t("studentsAdmin.date")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {grades.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    {t("studentsAdmin.aucuneNoteEnregistree")}
                                </TableCell>
                            </TableRow>
                        ) : (
                            grades.map((grade) => (
                                <TableRow key={grade.id}>
                                    <TableCell className="font-medium">{grade.assessment.subject.name}</TableCell>
                                    <TableCell>{grade.assessment.name}</TableCell>
                                    <TableCell>{grade.assessment.term.name}</TableCell>
                                    <TableCell>
                                        <Badge variant={grade.score !== null && grade.score >= grade.assessment.max_score / 2 ? "default" : "destructive"}>
                                            {grade.score !== null ? `${grade.score}/${grade.assessment.max_score}` : "-"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{new Date(grade.created_at).toLocaleDateString(intlLocale())}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
