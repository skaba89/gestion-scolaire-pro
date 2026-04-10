import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Employee, Payslip } from "@/types/humanResources";

interface PayslipDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    payslip: Payslip | null;
    employees: Employee[];
    onSubmit: (data: any) => void;
    isSubmitting?: boolean;
}

export function PayslipDialog({ open, onOpenChange, payslip, employees, onSubmit, isSubmitting }: PayslipDialogProps) {
    const [form, setForm] = useState<any>({
        employee_id: "",
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        gross_salary: "",
        net_salary: "",
        pay_date: new Date().toISOString().split('T')[0]
    });

    const months = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];

    useEffect(() => {
        if (payslip) {
            setForm({
                employee_id: payslip.employee_id,
                period_month: payslip.period_month,
                period_year: payslip.period_year,
                gross_salary: payslip.gross_salary.toString(),
                net_salary: payslip.net_salary.toString(),
                pay_date: payslip.pay_date ? payslip.pay_date.split('T')[0] : ""
            });
        } else {
            setForm({
                employee_id: "",
                period_month: new Date().getMonth() + 1,
                period_year: new Date().getFullYear(),
                gross_salary: "",
                net_salary: "",
                pay_date: new Date().toISOString().split('T')[0]
            });
        }
    }, [payslip, open]);

    const handleSubmit = () => {
        const data = {
            ...form,
            gross_salary: parseFloat(form.gross_salary) || 0,
            net_salary: parseFloat(form.net_salary) || 0,
        };
        onSubmit(data);
    };

    const isInvalid = !form.employee_id || !form.net_salary;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{payslip ? "Modifier" : "Nouveau"} bulletin de paie</DialogTitle>
                    <DialogDescription>
                        {payslip ? "Modifiez les informations du bulletin" : "Enregistrez un nouveau bulletin de salaire"}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="employee_id">Employé *</Label>
                        <Select
                            value={form.employee_id}
                            onValueChange={(v) => setForm({ ...form, employee_id: v })}
                            disabled={!!payslip}
                        >
                            <SelectTrigger id="employee_id">
                                <SelectValue placeholder="Sélectionner un employé" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.filter(e => e.is_active || e.id === form.employee_id).map((emp) => (
                                    <SelectItem key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="period_month">Mois</Label>
                            <Select
                                value={form.period_month.toString()}
                                onValueChange={(v) => setForm({ ...form, period_month: parseInt(v) })}
                            >
                                <SelectTrigger id="period_month">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map((m, i) => (
                                        <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="period_year">Année</Label>
                            <Input
                                id="period_year"
                                type="number"
                                value={form.period_year}
                                onChange={(e) => setForm({ ...form, period_year: parseInt(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="gross_salary">Salaire Brut</Label>
                            <Input
                                id="gross_salary"
                                type="number"
                                value={form.gross_salary}
                                onChange={(e) => setForm({ ...form, gross_salary: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="net_salary">Salaire Net *</Label>
                            <Input
                                id="net_salary"
                                type="number"
                                value={form.net_salary}
                                onChange={(e) => setForm({ ...form, net_salary: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="pay_date">Date de paiement</Label>
                        <Input
                            id="pay_date"
                            type="date"
                            value={form.pay_date}
                            onChange={(e) => setForm({ ...form, pay_date: e.target.value })}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isInvalid || isSubmitting}
                    >
                        {payslip ? "Modifier" : "Enregistrer"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
