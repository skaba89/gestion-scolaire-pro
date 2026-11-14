import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { intlLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

interface Attendance {
    id: string;
    date: string;
    status: string;
    notes: string | null;
    classroom: { name: string } | null;
}

interface StudentAttendanceTabProps {
    attendance: Attendance[];
    stats: {
        total: number;
        present: number;
        absent: number;
    };
}

export function StudentAttendanceTab({ attendance, stats }: StudentAttendanceTabProps) {
    const { t } = useTranslation();
    const getStatusBadge = (status: string) => {
        const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
            PRESENT: "default",
            ABSENT: "destructive",
            LATE: "secondary",
            EXCUSED: "outline",
        };
        const labels: Record<string, string> = {
            PRESENT: t("studentsAdmin.present"),
            ABSENT: t("studentsAdmin.status.ABSENT"),
            LATE: t("studentsAdmin.enRetard"),
            EXCUSED: t("studentsAdmin.excuse"),
        };
        return <Badge variant={variants[status] || "outline"}>{labels[status] || status}</Badge>;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("studentsAdmin.historiqueDesPresences")}</CardTitle>
                <CardDescription>
                    {t("studentsAdmin.totalEnregistrementsPresentPresentS", { total: stats.total, present: stats.present, absent: stats.absent })}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("studentsAdmin.date")}</TableHead>
                            <TableHead>{t("studentsAdmin.classe")}</TableHead>
                            <TableHead>{t("studentsAdmin.statut")}</TableHead>
                            <TableHead>{t("studentsAdmin.notes")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {attendance.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">
                                    {t("studentsAdmin.aucunEnregistrementDePresence")}
                                </TableCell>
                            </TableRow>
                        ) : (
                            attendance.map((a) => (
                                <TableRow key={a.id}>
                                    <TableCell>{new Date(a.date).toLocaleDateString(intlLocale())}</TableCell>
                                    <TableCell>{a.classroom?.name || "-"}</TableCell>
                                    <TableCell>{getStatusBadge(a.status)}</TableCell>
                                    <TableCell className="text-muted-foreground">{a.notes || "-"}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
