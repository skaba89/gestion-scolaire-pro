import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { QuickEnrollmentDialog } from "@/components/students/QuickEnrollmentDialog";
import { useTranslation } from "react-i18next";

interface Enrollment {
    id: string;
    academic_year: { id: string; name: string };
    classroom: { id: string; name: string };
    level: { id: string; name: string } | null;
    status: string;
}

interface StudentEnrollmentsTabProps {
    enrollments: Enrollment[];
    studentId: string;
    studentName: string;
    tenantId: string;
    studentLabel: string;
    onRefresh: () => void;
}

export function StudentEnrollmentsTab({
    enrollments,
    studentId,
    studentName,
    tenantId,
    studentLabel,
    onRefresh
}: StudentEnrollmentsTabProps) {
    const { t } = useTranslation();
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>{t("studentsAdmin.historiqueDesInscriptions")}</CardTitle>
                        <CardDescription>{t("studentsAdmin.parcoursScolaireDeLStudentlabel", { studentLabel: studentLabel.toLowerCase() })}</CardDescription>
                    </div>
                    <QuickEnrollmentDialog
                        studentId={studentId}
                        studentName={studentName}
                        tenantId={tenantId}
                        onSuccess={onRefresh}
                        trigger={
                            <Button size="sm">
                                <Plus className="h-4 w-4 mr-2" />
                                {t("studentsAdmin.nouvelleInscription")}
                            </Button>
                        }
                    />
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("studentsAdmin.anneeAcademique")}</TableHead>
                            <TableHead>{t("studentsAdmin.niveau")}</TableHead>
                            <TableHead>{t("studentsAdmin.classe")}</TableHead>
                            <TableHead>{t("studentsAdmin.statut")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {enrollments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground">
                                    {t("studentsAdmin.aucuneInscriptionEnregistree")}
                                </TableCell>
                            </TableRow>
                        ) : (
                            enrollments.map((enrollment) => (
                                <TableRow key={enrollment.id}>
                                    <TableCell className="font-medium">{enrollment.academic_year.name}</TableCell>
                                    <TableCell>{enrollment.level?.name || "-"}</TableCell>
                                    <TableCell>{enrollment.classroom.name}</TableCell>
                                    <TableCell>
                                        <Badge variant={enrollment.status === "ACTIVE" ? "default" : "secondary"}>
                                            {enrollment.status === "ACTIVE" ? "Actif" : enrollment.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
