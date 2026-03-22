import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { useHumanResources } from "@/hooks/useHumanResources";
import { Payslip } from "@/types/humanResources";
import { useTenant } from "@/contexts/TenantContext";
import { PayslipsTable } from "./PayslipsTable";
import { PayslipDialog } from "./PayslipDialog";
import { toast } from "sonner";

export function PayslipsTab() {
    const { tenant } = useTenant();
    const { usePayslips, useCreatePayslip, useUpdatePayslip, useDeletePayslip, useEmployees } = useHumanResources();
    const { data: payslipsData, isLoading } = usePayslips();
    const payslips = payslipsData?.payslips || [];

    const { data: employeesData } = useEmployees();
    const employees = employeesData?.employees || [];
    const createPayslipMutation = useCreatePayslip();
    const updatePayslipMutation = useUpdatePayslip();
    const deletePayslipMutation = useDeletePayslip();

    const [isPayslipDialogOpen, setIsPayslipDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

    const currency = (tenant?.settings as any)?.currency || "€";
    const months = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];

    const handleOpenCreate = () => {
        setSelectedPayslip(null);
        setIsPayslipDialogOpen(true);
    };

    const handleOpenEdit = (payslip: Payslip) => {
        setSelectedPayslip(payslip);
        setIsPayslipDialogOpen(true);
    };

    const handleOpenDelete = (payslip: Payslip) => {
        setSelectedPayslip(payslip);
        setIsDeleteDialogOpen(true);
    };

    const handleFormSubmit = (data: any) => {
        if (selectedPayslip) {
            updatePayslipMutation.mutate({ id: selectedPayslip.id, ...data }, {
                onSuccess: () => setIsPayslipDialogOpen(false)
            });
        } else {
            createPayslipMutation.mutate(data, {
                onSuccess: () => setIsPayslipDialogOpen(false)
            });
        }
    };

    const handleDelete = () => {
        if (selectedPayslip) {
            deletePayslipMutation.mutate(selectedPayslip.id, {
                onSuccess: () => {
                    setIsDeleteDialogOpen(false);
                    setSelectedPayslip(null);
                }
            });
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Fiches de paie</CardTitle>
                        <CardDescription>Gérez les bulletins de salaire</CardDescription>
                    </div>
                    <Button onClick={handleOpenCreate}>
                        <Plus className="h-4 w-4 mr-2" /> Nouveau bulletin
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <PayslipsTable
                        payslips={payslips}
                        currency={currency}
                        months={months}
                        onEdit={handleOpenEdit}
                        onDelete={handleOpenDelete}
                    />
                )}

                <PayslipDialog
                    open={isPayslipDialogOpen}
                    onOpenChange={setIsPayslipDialogOpen}
                    payslip={selectedPayslip}
                    employees={employees}
                    onSubmit={handleFormSubmit}
                    isSubmitting={createPayslipMutation.isPending || updatePayslipMutation.isPending}
                />

                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmation de suppression</AlertDialogTitle>
                            <AlertDialogDescription>
                                Êtes-vous sûr de vouloir supprimer ce bulletin de paie pour **{selectedPayslip?.employee?.first_name} {selectedPayslip?.employee?.last_name}** ({months[(selectedPayslip?.period_month || 1) - 1]} {selectedPayslip?.period_year}) ? Cette action est irréversible.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deletePayslipMutation.isPending}
                            >
                                {deletePayslipMutation.isPending ? "Suppression..." : "Supprimer"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card >
    );
}
