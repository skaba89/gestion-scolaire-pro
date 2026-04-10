import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
    const getStatusBadge = (status: string) => {
        const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
            PRESENT: "default",
            ABSENT: "destructive",
            LATE: "secondary",
            EXCUSED: "outline",
        };
        const labels: Record<string, string> = {
            PRESENT: "Présent",
            ABSENT: "Absent",
            LATE: "En retard",
            EXCUSED: "Excusé",
        };
        return <Badge variant={variants[status] || "outline"}>{labels[status] || status}</Badge>;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Historique des Présences</CardTitle>
                <CardDescription>
                    {stats.total} enregistrements - {stats.present} présent(s), {stats.absent} absent(s)
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Classe</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead>Notes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {attendance.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">
                                    Aucun enregistrement de présence
                                </TableCell>
                            </TableRow>
                        ) : (
                            attendance.map((a) => (
                                <TableRow key={a.id}>
                                    <TableCell>{new Date(a.date).toLocaleDateString("fr-FR")}</TableCell>
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
