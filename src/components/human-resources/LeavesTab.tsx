import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { useHumanResources } from "@/hooks/useHumanResources";
import { LeaveRequest } from "@/types/humanResources";
import { LeavesTable } from "./LeavesTable";
import { LeaveDialog } from "./LeaveDialog";

export function LeavesTab() {
    const { useLeaveRequests, useCreateLeaveRequest, useUpdateLeaveStatus, useDeleteLeaveRequest, useEmployees } = useHumanResources();
    const { data: leaveRequestsData, isLoading } = useLeaveRequests();
    const leaveRequests = leaveRequestsData?.leaveRequests || [];

    const { data: employeesData } = useEmployees();
    const employees = employeesData?.employees || [];
    const createLeaveMutation = useCreateLeaveRequest();
    const updateLeaveStatusMutation = useUpdateLeaveStatus();
    const deleteLeaveMutation = useDeleteLeaveRequest();

    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

    const handleOpenCreate = () => {
        setIsLeaveDialogOpen(true);
    };

    const handleCreate = (data: any) => {
        createLeaveMutation.mutate(data, {
            onSuccess: () => {
                setIsLeaveDialogOpen(false);
            }
        });
    };

    const handleStatusUpdate = (id: string, status: "APPROVED" | "REJECTED") => {
        updateLeaveStatusMutation.mutate({ id, status });
    };

    const handleOpenDelete = (leave: LeaveRequest) => {
        setSelectedLeave(leave);
        setIsDeleteDialogOpen(true);
    };

    const handleDelete = () => {
        if (selectedLeave) {
            deleteLeaveMutation.mutate(selectedLeave.id, {
                onSuccess: () => {
                    setIsDeleteDialogOpen(false);
                    setSelectedLeave(null);
                }
            });
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Demandes de congés</CardTitle>
                        <CardDescription>Gérez les demandes de congés du personnel</CardDescription>
                    </div>
                    <Button onClick={handleOpenCreate}>
                        <Plus className="h-4 w-4 mr-2" /> Nouvelle demande
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <LeavesTable
                        leaveRequests={leaveRequests}
                        onStatusUpdate={handleStatusUpdate}
                        onDelete={handleOpenDelete}
                    />
                )}

                <LeaveDialog
                    open={isLeaveDialogOpen}
                    onOpenChange={setIsLeaveDialogOpen}
                    employees={employees}
                    onSubmit={handleCreate}
                    isSubmitting={createLeaveMutation.isPending}
                />

                <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirmation de suppression</AlertDialogTitle>
                            <AlertDialogDescription>
                                Êtes-vous sûr de vouloir supprimer cette demande de congé pour **{selectedLeave?.employee?.first_name} {selectedLeave?.employee?.last_name}** ? Cette action est irréversible.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                className="bg-red-600 hover:bg-red-700"
                                disabled={deleteLeaveMutation.isPending}
                            >
                                {deleteLeaveMutation.isPending ? "Suppression..." : "Supprimer"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
        </Card>
    );
}
