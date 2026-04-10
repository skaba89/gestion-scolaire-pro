import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Employee } from "@/types/humanResources";
import { useHumanResources } from "@/hooks/useHumanResources";

interface EmployeeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
    onSubmit: (data: Partial<Employee>) => void;
    isSubmitting?: boolean;
}

export function EmployeeDialog({ open, onOpenChange, employee, onSubmit, isSubmitting }: EmployeeDialogProps) {
    const { useLastEmployeeNumber } = useHumanResources();
    const { data: lastNumber } = (typeof useLastEmployeeNumber === 'function') 
        ? useLastEmployeeNumber() 
        : { data: null };

    const [form, setForm] = useState<Partial<Employee>>({
        employee_number: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        job_title: "",
        department: "",
        hire_date: new Date().toISOString().split('T')[0],
        is_active: true
    });

    const generateNextNumber = (last: string | null) => {
        if (!last) return "EMP-001";

        const match = last.match(/EMP-(\d+)/i);
        if (match) {
            const nextId = parseInt(match[1]) + 1;
            return `EMP-${nextId.toString().padStart(3, '0')}`;
        }

        // Fallback for non-standard formats to reset or simplistic increment
        const numericMatch = last.match(/(\d+)$/);
        if (numericMatch) {
            const nextId = parseInt(numericMatch[1]) + 1;
            // If simple number, pad to 3
            return `EMP-${nextId.toString().padStart(3, '0')}`;
        }

        return "EMP-001";
    };

    useEffect(() => {
        if (employee) {
            setForm(employee);
        } else {
            setForm({
                employee_number: generateNextNumber(lastNumber),
                first_name: "",
                last_name: "",
                email: "",
                phone: "",
                job_title: "",
                department: "",
                hire_date: new Date().toISOString().split('T')[0],
                is_active: true
            });
        }
    }, [employee, open, lastNumber]);

    const handleSubmit = () => {
        onSubmit(form);
    };

    const isInvalid = !form.employee_number || !form.first_name || !form.last_name || !form.hire_date;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{employee ? "Modifier l'employé" : "Nouvel employé"}</DialogTitle>
                    <DialogDescription>
                        {employee ? "Mettez à jour les informations de l'employé" : "Ajoutez un nouvel employé au système"}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="employee_number">Matricule</Label>
                        <Input
                            id="employee_number"
                            value={form.employee_number}
                            readOnly
                            className="bg-muted font-mono"
                            placeholder="Généré automatiquement (ex: EMP-001)"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="hire_date">Date d'embauche *</Label>
                        <Input
                            id="hire_date"
                            type="date"
                            value={form.hire_date}
                            onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="first_name">Prénom *</Label>
                        <Input
                            id="first_name"
                            value={form.first_name}
                            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="last_name">Nom *</Label>
                        <Input
                            id="last_name"
                            value={form.last_name}
                            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={form.email || ""}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Téléphone</Label>
                        <Input
                            id="phone"
                            value={form.phone || ""}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="job_title">Poste</Label>
                        <Input
                            id="job_title"
                            value={form.job_title || ""}
                            onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="department">Département</Label>
                        <Input
                            id="department"
                            value={form.department || ""}
                            onChange={(e) => setForm({ ...form, department: e.target.value })}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isInvalid || isSubmitting}
                    >
                        {employee ? "Mettre à jour" : "Enregistrer"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
