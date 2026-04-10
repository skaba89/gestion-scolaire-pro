import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { hrQueries } from "@/queries/hr";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Contract, CONTRACT_TYPE_LABELS, Employee } from "@/types/humanResources";

interface ContractDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contract: Contract | null;
    employees: Employee[];
    currency: string;
    onSubmit: (data: any) => void;
    isSubmitting?: boolean;
}

export function ContractDialog({ open, onOpenChange, contract, employees, currency, onSubmit, isSubmitting }: ContractDialogProps) {
    const { tenant } = useTenant();
    const [form, setForm] = useState<any>({
        contract_number: "",
        employee_id: "",
        contract_type: "CDI",
        job_title: "",
        start_date: new Date().toISOString().split('T')[0],
        end_date: "",
        gross_monthly_salary: "",
        is_current: true
    });

    const { data: lastNumber } = useQuery(hrQueries.lastContractNumber(tenant?.id || ""));

    useEffect(() => {
        if (contract) {
            setForm({
                ...contract,
                gross_monthly_salary: contract.gross_monthly_salary.toString()
            });
        } else {
            setForm({
                contract_number: "",
                employee_id: "",
                contract_type: "CDI",
                job_title: "",
                start_date: new Date().toISOString().split('T')[0],
                end_date: "",
                gross_monthly_salary: "",
                is_current: true
            });
        }
    }, [contract, open]);

    // Auto-generate contract number based on global sequence
    useEffect(() => {
        if (!contract && open) {
            const year = new Date().getFullYear();

            if (lastNumber) {
                // Try to parse format CTR-{YEAR}-{SEQ}
                const match = lastNumber.match(/CTR-\d+-(\d+)/);
                if (match) {
                    const seq = parseInt(match[1]) + 1;
                    const nextSeq = seq.toString().padStart(4, '0');
                    setForm(f => ({ ...f, contract_number: `CTR-${year}-${nextSeq}` }));
                } else {
                    // Fallback or restart sequence if format is different
                    setForm(f => ({ ...f, contract_number: `CTR-${year}-0001` }));
                }
            } else {
                setForm(f => ({ ...f, contract_number: `CTR-${year}-0001` }));
            }
        }
    }, [lastNumber, contract, open]);

    const handleSubmit = () => {
        const salary = parseFloat(form.gross_monthly_salary);
        if (isNaN(salary)) {
            // Should be handled by UI validation but as a safeguard
            return;
        }

        const payload = {
            ...form,
            gross_monthly_salary: salary
        };
        onSubmit(payload);
    };

    const isInvalid = !form.employee_id || !form.contract_number || !form.job_title || !form.gross_monthly_salary || !form.start_date;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{contract ? "Modifier le contrat" : "Nouveau contrat de travail"}</DialogTitle>
                    <DialogDescription>
                        {contract ? "Mettez à jour les informations du contrat" : "Créez un nouveau contrat pour un employé"}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                    <div className="md:col-span-2 space-y-2">
                        <Label htmlFor="employee_id">Employé *</Label>
                        <Select
                            value={form.employee_id}
                            onValueChange={(v) => setForm({ ...form, employee_id: v })}
                            disabled={!!contract}
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
                    <div className="space-y-2">
                        <Label htmlFor="contract_number">N° de contrat *</Label>
                        <Input
                            id="contract_number"
                            value={form.contract_number}
                            readOnly
                            className="bg-muted"
                            placeholder="Généré automatiquement..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="contract_type">Type de contrat *</Label>
                        <Select value={form.contract_type} onValueChange={(v) => setForm({ ...form, contract_type: v })}>
                            <SelectTrigger id="contract_type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(CONTRACT_TYPE_LABELS).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="job_title">Poste *</Label>
                        <Input
                            id="job_title"
                            value={form.job_title}
                            onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="gross_monthly_salary">Salaire brut mensuel ({currency}) *</Label>
                        <Input
                            id="gross_monthly_salary"
                            type="number"
                            value={form.gross_monthly_salary}
                            onChange={(e) => setForm({ ...form, gross_monthly_salary: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="start_date">Date de début *</Label>
                        <Input
                            id="start_date"
                            type="date"
                            value={form.start_date}
                            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="end_date">Date de fin (si applicable)</Label>
                        <Input
                            id="end_date"
                            type="date"
                            value={form.end_date || ""}
                            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        />
                    </div>
                    {contract && (
                        <div className="flex items-center space-x-2 pt-4">
                            <input
                                type="checkbox"
                                id="is_current"
                                checked={form.is_current}
                                onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            <Label htmlFor="is_current" className="cursor-pointer">Contrat actif</Label>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isInvalid || isSubmitting}
                    >
                        {contract ? "Mettre à jour" : "Créer le contrat"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
