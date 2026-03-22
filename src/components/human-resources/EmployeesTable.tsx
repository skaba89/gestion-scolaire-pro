import { useRef, useState } from "react";
import { format } from "date-fns";
import { Eye, Edit, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Employee } from "@/types/humanResources";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
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
import { Loader2 } from "lucide-react";

interface EmployeesTableProps {
    employees: Employee[];
    isLoading: boolean;
    totalCount: number;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
    onView: (employee: Employee) => void;
    onEdit: (employee: Employee) => void;
    onDelete: (employee: Employee) => void;
}

export function EmployeesTable({
    employees,
    isLoading,
    totalCount,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onView,
    onEdit,
    onDelete,
}: EmployeesTableProps) {
    const totalPages = Math.ceil(totalCount / pageSize);

    return (
        <div className="space-y-4">
            <div className="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                        <TableRow>
                            <TableHead>Matricule</TableHead>
                            <TableHead>Nom</TableHead>
                            <TableHead>Poste</TableHead>
                            <TableHead>Département</TableHead>
                            <TableHead>Date d'embauche</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Chargement...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : employees.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    Aucun employé trouvé
                                </TableCell>
                            </TableRow>
                        ) : (
                            employees.map((employee) => (
                                <TableRow key={employee.id}>
                                    <TableCell className="font-mono">{employee.employee_number}</TableCell>
                                    <TableCell className="font-medium">{employee.first_name} {employee.last_name}</TableCell>
                                    <TableCell>{employee.job_title || "-"}</TableCell>
                                    <TableCell>{employee.department || "-"}</TableCell>
                                    <TableCell>{employee.hire_date ? format(new Date(employee.hire_date), "dd/MM/yyyy") : "-"}</TableCell>
                                    <TableCell>
                                        <Badge variant={employee.is_active ? "default" : "secondary"}>
                                            {employee.is_active ? "Actif" : "Inactif"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => onView(employee)} aria-label="Voir details">
                                            <Eye className="h-4 w-4 text-blue-600" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => onEdit(employee)} aria-label="Modifier">
                                            <Edit className="h-4 w-4 text-amber-600" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => onDelete(employee)} aria-label="Supprimer">
                                            <Trash2 className="h-4 w-4 text-red-600" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
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
                                <span className="text-sm font-medium">Page {currentPage} sur {totalPages}</span>
                            </PaginationItem>

                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
