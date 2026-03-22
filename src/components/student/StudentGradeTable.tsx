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
import { fr } from "date-fns/locale";

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
    return (
        <Card className="border-primary/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-lg font-display">Relevé de Notes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                {grades.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        Aucune note disponible pour le moment
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="font-semibold px-6">Matière</TableHead>
                                <TableHead className="font-semibold">Évaluation</TableHead>
                                <TableHead className="font-semibold">Type</TableHead>
                                <TableHead className="font-semibold">Date</TableHead>
                                <TableHead className="text-right font-semibold px-6">Note</TableHead>
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
                                                ? format(new Date(grade.assessments.date), "dd/MM/yyyy", { locale: fr })
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
