import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { Student } from "@/queries/students";
import { StudentRowOptimized } from "@/components/students/StudentRowOptimized";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { DataTablePagination } from "@/components/ui/DataTablePagination";
import { EmptyState } from "@/components/ui/empty-state";
import { exportToCSV } from "@/utils/exportUtils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StudentTableProps {
    students: Student[];
    isLoading: boolean;
    totalCount: number;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    studentsLabel: string;
    studentLabel: string;
    showArchived: boolean;
    creatingAccountFor: string | null;
    onEdit: (student: Student) => void;
    onView: (student: Student) => void;
    onArchive: (id: string, archived: boolean, name: string) => void;
    onDelete: (id: string) => void;
    onCreateAccount: (student: Student) => void;
    onEnrollClick: (student: Student) => void;
    tenantId?: string;
}

export const StudentTable = ({
    students,
    isLoading,
    totalCount,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    studentsLabel,
    studentLabel,
    showArchived,
    creatingAccountFor,
    onEdit,
    onView,
    onArchive,
    onDelete,
    onCreateAccount,
    onEnrollClick,
    tenantId,
}: StudentTableProps) => {
    const { t } = useTranslation();
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: students.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 73,
        overscan: 10,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
        : 0;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        {showArchived ? t("studentsAdmin.archivedCount", { label: studentsLabel, count: totalCount }) : t("studentsAdmin.activeCount", { label: studentsLabel, count: totalCount })}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const count = exportToCSV(
                                students.map(s => ({
                                    matricule: s.registration_number,
                                    nom: s.last_name,
                                    prenom: s.first_name,
                                    email: s.email,
                                    telephone: s.phone,
                                    genre: s.gender,
                                    date_naissance: s.date_of_birth
                                })),
                                studentsLabel.toLowerCase()
                            );
                            toast.success(t("studentsAdmin.countStudentslabelExportes", { count, studentsLabel: studentsLabel.toLowerCase() }));
                        }}
                        disabled={students.length === 0}
                    >
                        <Download className="w-4 h-4 mr-2" />
                        {t("studentsAdmin.exportCsv")}
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <TableSkeleton columns={7} rows={8} />
                ) : students.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title={t("studentsAdmin.aucunStudentlabelTrouve", { studentLabel })}
                        description={t("studentsAdmin.commencezParAjouterDesStudentslabel", { studentsLabel: studentsLabel.toLowerCase() })}
                        actionLabel={`Ajouter un ${studentLabel}`}
                        onAction={() => document.getElementById("add-student-trigger")?.click()}
                    />
                ) : (
                    <div
                        ref={parentRef}
                        className="h-[600px] overflow-auto border rounded-md relative"
                    >
                        <Table role="grid" aria-label={t("studentsAdmin.tableauDesStudentslabel", { studentsLabel })}>
                            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-12" role="columnheader">{t("studentsAdmin.photo")}</TableHead>
                                    <TableHead className="hidden sm:table-cell" role="columnheader">N° {studentLabel.charAt(0).toUpperCase() + studentLabel.slice(1)}</TableHead>
                                    <TableHead role="columnheader">{t("studentsAdmin.nomComplet")}</TableHead>
                                    <TableHead className="hidden md:table-cell" role="columnheader">{t("studentsAdmin.emailResponsable")}</TableHead>
                                    <TableHead className="hidden lg:table-cell" role="columnheader">{t("studentsAdmin.dateDeNaissance")}</TableHead>
                                    <TableHead className="hidden lg:table-cell" role="columnheader">{t("studentsAdmin.genre")}</TableHead>
                                    <TableHead className="text-right" role="columnheader">{t("studentsAdmin.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paddingTop > 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} style={{ height: `${paddingTop}px` }} />
                                    </TableRow>
                                )}
                                {/* 2026-11-12 : plus de conteneurs d'animation (div) entre
                                    <tbody> et les lignes — HTML invalide (avertissements React). */}
                                {virtualItems.map((virtualRow) => {
                                    const student = students[virtualRow.index];
                                    return (
                                        <StudentRowOptimized
                                            key={student.id}
                                            student={student}
                                            creatingAccountFor={creatingAccountFor}
                                            onEdit={onEdit}
                                            onView={onView}
                                            onArchive={onArchive}
                                            onDelete={onDelete}
                                            onCreateAccount={onCreateAccount}
                                            onEnrollClick={() => onEnrollClick(student)}
                                            tenantId={tenantId}
                                            style={{ height: `${virtualRow.size}px` }}
                                            ariaRole="row"
                                            ariaRowIndex={virtualRow.index + 1}
                                        />
                                    );
                                })}
                                {paddingBottom > 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} style={{ height: `${paddingBottom}px` }} />
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
            {totalCount > 0 && (
                <div className="border-t">
                    <DataTablePagination
                        currentPage={currentPage}
                        pageSize={pageSize}
                        totalCount={totalCount}
                        onPageChange={onPageChange}
                        onPageSizeChange={onPageSizeChange}
                    />
                </div>
            )}
        </Card>
    );
};
