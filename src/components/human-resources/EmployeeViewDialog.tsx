import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Employee } from "@/types/humanResources";

interface EmployeeViewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
}

export function EmployeeViewDialog({ open, onOpenChange, employee }: EmployeeViewDialogProps) {
    if (!employee) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Détails de l'employé</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b">
                        <div className="text-2xl font-bold">{employee.first_name} {employee.last_name}</div>
                        <Badge variant={employee.is_active ? "default" : "secondary"}>
                            {employee.is_active ? "Actif" : "Inactif"}
                        </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="text-muted-foreground">Matricule:</div>
                        <div className="font-mono">{employee.employee_number}</div>
                        <div className="text-muted-foreground">Poste:</div>
                        <div>{employee.job_title || "-"}</div>
                        <div className="text-muted-foreground">Département:</div>
                        <div>{employee.department || "-"}</div>
                        <div className="text-muted-foreground">Date d'embauche:</div>
                        <div>{format(new Date(employee.hire_date), "dd/MM/yyyy")}</div>
                        <div className="text-muted-foreground">Email:</div>
                        <div>{employee.email || "-"}</div>
                        <div className="text-muted-foreground">Téléphone:</div>
                        <div>{employee.phone || "-"}</div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
