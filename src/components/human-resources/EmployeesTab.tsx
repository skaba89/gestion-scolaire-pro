import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { useHumanResources } from "@/hooks/useHumanResources";
import { Employee } from "@/types/humanResources";
import { EmployeesTable } from "./EmployeesTable";
import { EmployeeDialog } from "./EmployeeDialog";
import { EmployeeViewDialog } from "./EmployeeViewDialog";

export function EmployeesTab() {
    const { useEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee } = useHumanResources();
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [searchTerm, setSearchTerm] = useState("");

    const { data, isLoading } = useEmployees({ page: currentPage, pageSize });
    const employees = data?.employees || [];
    const totalCount = data?.totalCount || 0;

    const createEmployeeMutation = useCreateEmployee();
    const updateEmployeeMutation = useUpdateEmployee();
    const deleteEmployeeMutation = useDeleteEmployee();
    const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    const filteredEmployees = employees.filter(emp =>
        `${emp.first_name} ${emp.last_name} ${emp.employee_number}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleOpenCreate = () => {
        setSelectedEmployee(null);
        setIsEmployeeDialogOpen(true);
    };

    const handleOpenEdit = (employee: Employee) => {
        setSelectedEmployee(employee);
        setIsEmployeeDialogOpen(true);
    };

    const handleOpenView = (employee: Employee) => {
        setSelectedEmployee(employee);
        setIsViewDialogOpen(true);
    };

    const handleOpenDelete = (employee: Employee) => {
        setSelectedEmployee(employee);
        setIsDeleteDialogOpen(true);
    };

    const handleFormSubmit = (data: Partial<Employee>) => {
        if (selectedEmployee) {
            updateEmployeeMutation.mutate({ id: selectedEmployee.id, ...data } as any, {
                onSuccess: () => setIsEmployeeDialogOpen(false)
            });
        } else {
            createEmployeeMutation.mutate(data, {
                onSuccess: () => setIsEmployeeDialogOpen(false)
            });
        }
    };

    const handleDelete = () => {
        if (selectedEmployee) {
            deleteEmployeeMutation.mutate(selectedEmployee.id, {
                onSuccess: () => {
                    setIsDeleteDialogOpen(false);
                    setSelectedEmployee(null);
                }
            });
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                    <div>
                        <CardTitle>Liste des employés</CardTitle>
                        <CardDescription>Gérez les informations du personnel</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 w-64"
                            />
                        </div>
                        <Button onClick={handleOpenCreate}>
                            <Plus className="h-4 w-4 mr-2" /> Ajouter
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <EmployeesTable
                        employees={filteredEmployees}
                        isLoading={isLoading}
                        totalCount={totalCount}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                        onView={handleOpenView}
                        onEdit={handleOpenEdit}
                        onDelete={handleOpenDelete}
                    />
                )}

                <EmployeeDialog
                    open={isEmployeeDialogOpen}
                    onOpenChange={setIsEmployeeDialogOpen}
                    employee={selectedEmployee}
                    onSubmit={handleFormSubmit}
                    isSubmitting={createEmployeeMutation.isPending || updateEmployeeMutation.isPending}
                />

                <EmployeeViewDialog
                    open={isViewDialogOpen}
                    onOpenChange={setIsViewDialogOpen}
                    employee={selectedEmployee}
                />

                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmation de suppression</AlertDialogTitle>
                            <AlertDialogDescription>
                                Êtes-vous sûr de vouloir supprimer l'employé **{selectedEmployee?.first_name} {selectedEmployee?.last_name}** ? Cette action est irréversible.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deleteEmployeeMutation.isPending}
                            >
                                {deleteEmployeeMutation.isPending ? "Suppression..." : "Supprimer"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
