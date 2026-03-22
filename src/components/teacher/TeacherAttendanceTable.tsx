import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Check, X, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AttendanceStatus } from "@/hooks/queries/useTeacherAttendance";

const statusConfig: Record<AttendanceStatus, { label: string; icon: any; color: string }> = {
    PRESENT: { label: "Présent", icon: Check, color: "text-green-600 bg-green-500/20" },
    ABSENT: { label: "Absent", icon: X, color: "text-red-600 bg-red-500/20" },
    LATE: { label: "Retard", icon: Clock, color: "text-orange-600 bg-orange-500/20" },
    EXCUSED: { label: "Excusé", icon: AlertCircle, color: "text-blue-600 bg-blue-500/20" },
};

interface TeacherAttendanceTableProps {
    students: any[];
    attendance: any[];
    onSaveAttendance: (studentId: string, status: AttendanceStatus, studentName: string) => void;
    isPending: boolean;
    selectedDate: string;
    studentLabel: string;
}

export const TeacherAttendanceTable = ({
    students,
    attendance,
    onSaveAttendance,
    isPending,
    selectedDate,
    studentLabel,
}: TeacherAttendanceTableProps) => {
    return (
        <Card className="border-primary/10 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardCheck className="w-5 h-5 text-primary" />
                    Feuille de Présence - {format(new Date(selectedDate), "EEEE d MMMM yyyy", { locale: fr })}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="py-4 px-6 font-semibold">N° Étudiant</TableHead>
                            <TableHead className="py-4 px-6 font-semibold">{studentLabel}</TableHead>
                            <TableHead className="py-4 px-6 text-center font-semibold">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {students.map((enrollment) => {
                            const student = enrollment.students;
                            const record = attendance?.find(a => a.student_id === student?.id);
                            const currentStatus = record?.status as AttendanceStatus | undefined;

                            return (
                                <TableRow key={enrollment.student_id} className="hover:bg-primary/5 transition-colors group">
                                    <TableCell className="px-6 py-4">
                                        <Badge variant="outline" className="font-mono group-hover:border-primary/30 transition-colors">
                                            {student?.registration_number || "S/M"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 font-medium">
                                        {student?.first_name} {student?.last_name}
                                    </TableCell>
                                    <TableCell className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-2">
                                            {(Object.keys(statusConfig) as AttendanceStatus[]).map((status) => {
                                                const config = statusConfig[status];
                                                const Icon = config.icon;
                                                const isActive = currentStatus === status;

                                                return (
                                                    <Button
                                                        key={status}
                                                        size="sm"
                                                        variant={isActive ? "default" : "outline"}
                                                        className={cn(
                                                            "h-9 w-9 p-0 transition-all duration-200",
                                                            isActive ? config.color : "hover:bg-muted"
                                                        )}
                                                        onClick={() => onSaveAttendance(
                                                            student?.id,
                                                            status,
                                                            `${student?.first_name} ${student?.last_name}`
                                                        )}
                                                        disabled={isPending}
                                                    >
                                                        <Icon className="w-4 h-4" />
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};
