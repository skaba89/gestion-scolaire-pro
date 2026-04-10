import { useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart3, History, Save } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import GradeHistorySheet from "@/components/grades/GradeHistorySheet";
import type { Assessment } from "@/features/grades/services/gradesService";
import type { Grade } from "@/features/grades/types/grades";

interface TeacherGradeTableProps {
    assessment: Assessment | undefined;
    students: any[] | undefined;
    grades: Grade[] | undefined;
    onSaveGrade: (studentId: string, score: number) => void;
    isSaving: boolean;
    studentLabel: string;
}

export const TeacherGradeTable = ({
    assessment,
    students,
    grades,
    onSaveGrade,
    isSaving,
    studentLabel,
}: TeacherGradeTableProps) => {
    const [historyGradeId, setHistoryGradeId] = useState<string | null>(null);
    const [historyStudentName, setHistoryStudentName] = useState("");

    if (!assessment || !students) return null;

    return (
        <StaggerContainer>
            <StaggerItem index={0}>
                <Card className="border-primary/10 shadow-md overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b">
                        <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <BarChart3 className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <span className="text-lg">Saisie des Notes</span>
                                    <p className="text-xs font-normal text-muted-foreground mt-0.5">
                                        {assessment.name} — {assessment.subjects?.name}
                                    </p>
                                </div>
                            </div>
                            <Badge variant="secondary" className="px-3 py-1 font-bold text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                Sur {assessment.max_score}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="py-4 px-6 font-semibold">N° Étudiant</TableHead>
                                    <TableHead className="py-4 px-6 font-semibold">{studentLabel}</TableHead>
                                    <TableHead className="py-4 px-6 w-32 font-semibold">Note</TableHead>
                                    <TableHead className="py-4 px-6 w-32 text-right font-semibold">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {students.map((enrollment) => {
                                    const student = enrollment.students as any;
                                    const existingGrade = grades?.find(g => g.student_id === student?.id);

                                    return (
                                        <TableRow key={enrollment.student_id} className="hover:bg-primary/5 transition-colors group">
                                            <TableCell className="px-6 py-4">
                                                <Badge variant="outline" className="font-mono bg-background group-hover:border-primary/30 transition-colors">
                                                    {student?.registration_number || "S/M"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-6 py-4 font-medium">
                                                {student?.first_name} {student?.last_name}
                                            </TableCell>
                                            <TableCell className="px-6 py-4">
                                                <Input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    max={assessment.max_score || 20}
                                                    defaultValue={existingGrade?.score || ""}
                                                    className="w-24 bg-background/50 focus:bg-background transition-all border-muted-foreground/20 hover:border-primary/30 focus-visible:ring-primary/20 text-center font-bold"
                                                    id={`grade-${student?.id}`}
                                                />
                                            </TableCell>
                                            <TableCell className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                    {existingGrade && (
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                            onClick={() => {
                                                                setHistoryGradeId(existingGrade.id);
                                                                setHistoryStudentName(`${student?.first_name} ${student?.last_name}`);
                                                            }}
                                                        >
                                                            <History className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-9 w-9 text-muted-foreground hover:text-green-600 hover:bg-green-50"
                                                        onClick={() => {
                                                            const input = document.getElementById(`grade-${student?.id}`) as HTMLInputElement;
                                                            const score = parseFloat(input.value);
                                                            onSaveGrade(student?.id, score);
                                                        }}
                                                        disabled={isSaving}
                                                    >
                                                        <Save className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>

                        <GradeHistorySheet
                            gradeId={historyGradeId || undefined}
                            isOpen={!!historyGradeId}
                            onOpenChange={(open) => !open && setHistoryGradeId(null)}
                            studentName={historyStudentName}
                        />
                    </CardContent>
                </Card>
            </StaggerItem>
        </StaggerContainer>
    );
};
