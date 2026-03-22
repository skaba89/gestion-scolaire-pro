import { useRef } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GraduationCap, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffProfile as TeacherProfile } from "@/features/staff/types";
import { TeacherRow } from "./TeacherRow";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StaggerContainer, StaggerItem } from "@/components/layouts/PageTransition";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface TeacherTableProps {
    teachers: TeacherProfile[];
    isLoading: boolean;
    totalCount: number;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onView: (teacher: TeacherProfile) => void;
    onAssign: (teacher: TeacherProfile) => void;
    onDelete: (teacher: TeacherProfile) => void;
    onAddClick: () => void;
    searchQuery: string;
}

export const TeacherTable = ({
    teachers,
    isLoading,
    totalCount,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onView,
    onAssign,
    onDelete,
    onAddClick,
    searchQuery,
}: TeacherTableProps) => {

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <GraduationCap className="w-5 h-5" />
                        Liste des Professeurs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <TableSkeleton columns={5} rows={8} />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <GraduationCap className="w-5 h-5" />
                            Liste des Professeurs
                        </CardTitle>
                        <CardDescription>
                            {teachers.length} enseignant(s) trouvé(s)
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {teachers.length === 0 ? (
                    <EmptyState
                        icon={GraduationCap}
                        title={searchQuery ? "Aucun enseignant trouvé" : "Aucun enseignant"}
                        description={searchQuery ? "Essayez de modifier votre recherche." : "Commencez par ajouter des enseignants à votre établissement."}
                        actionLabel="Ajouter un enseignant"
                        onAction={onAddClick}
                    />
                ) : (
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader className="bg-background z-10 shadow-sm">
                                <TableRow>
                                    <TableHead className="w-[30%]">Nom</TableHead>
                                    <TableHead className="w-[20%]">Email</TableHead>
                                    <TableHead className="w-[20%]">Téléphone</TableHead>
                                    <TableHead className="w-[15%]">Statut</TableHead>
                                    <TableHead className="text-right w-[15%]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <StaggerContainer className="contents">
                                    {teachers.map((teacher) => (
                                        <TeacherRow
                                            key={teacher.id}
                                            teacher={teacher}
                                            onView={onView}
                                            onAssign={onAssign}
                                            onDelete={onDelete}
                                        />
                                    ))}
                                </StaggerContainer>
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
            {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Afficher</span>
                        <Select
                            value={pageSize.toString()}
                            onValueChange={(v) => onPageSizeChange(parseInt(v))}
                        >
                            <SelectTrigger className="h-8 w-[70px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                        <span>par page</span>
                        <span className="ml-4">
                            {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, totalCount)} sur {totalCount}
                        </span>
                    </div>

                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>

                            <PaginationItem>
                                <span className="text-sm font-medium">Page {currentPage} sur {Math.ceil(totalCount / pageSize)}</span>
                            </PaginationItem>

                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => onPageChange(Math.min(Math.ceil(totalCount / pageSize), currentPage + 1))}
                                    className={currentPage === Math.ceil(totalCount / pageSize) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </Card >
    );
};
